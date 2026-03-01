import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import type { Core, EventObject } from "cytoscape";
// @ts-expect-error — cytoscape-fcose has no type definitions
import fcose from "cytoscape-fcose";

import { apiClient } from "../api/client";
import {
  CATEGORY_COLORS,
  DEFAULT_NODE_COLOR,
} from "../constants/graphColors";
import { useAppStore } from "../stores/useAppStore";
import type { GraphOverviewPayload, OverviewNode } from "../types";

cytoscape.use(fcose);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function nodeSize(connectionCount: number, isOverview: boolean): number {
  if (isOverview) {
    return Math.max(20, Math.min(70, 14 + Math.sqrt(connectionCount) * 8));
  }
  return Math.max(16, Math.min(50, 10 + Math.sqrt(connectionCount) * 6));
}

function labelThreshold(nodes: OverviewNode[], isOverview: boolean): number {
  if (nodes.length === 0) return 0;
  const percentile = isOverview ? 0.6 : 0.4;
  const sorted = [...nodes]
    .map((n) => n.connection_count)
    .sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * percentile);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [overviewError, setOverviewError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [forceRender, setForceRender] = useState(0);

  // Store state
  const graphData = useAppStore((s) => s.graphData);
  const overviewData = useAppStore((s) => s.overviewData);
  const isOverviewMode = useAppStore((s) => s.isOverviewMode);
  const hiddenCategories = useAppStore((s) => s.hiddenCategories);
  const selectNode = useAppStore((s) => s.selectNode);
  const setOverviewData = useAppStore((s) => s.setOverviewData);
  const setOverviewMode = useAppStore((s) => s.setOverviewMode);

  // ---- Fetch overview on mount (with retry for Neo4j cold-start) ----
  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    const maxRetries = 5;
    const retryDelayMs = 3000;

    const fetchOverview = () => {
      apiClient
        .getOverview()
        .then((data) => {
          if (!cancelled) {
            setOverviewData(data);
            setOverviewError(false);
            setRetryCount(0);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn(`[GraphCanvas] Overview fetch failed (attempt ${retries + 1}/${maxRetries + 1}):`, err);
          if (retries < maxRetries) {
            retries++;
            if (!cancelled) setRetryCount(retries);
            setTimeout(fetchOverview, retryDelayMs);
          } else {
            setOverviewError(true);
            setRetryCount(0);
          }
        });
    };

    fetchOverview();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Determine which data to display ----
  const activeData = useMemo(() => {
    if (!isOverviewMode && graphData) {
      // Build a lookup for real connection_count from overview data
      const ccLookup = new Map<string, number>();
      if (overviewData) {
        for (const n of overviewData.nodes) {
          ccLookup.set(n.canonical_id, n.connection_count);
        }
      }

      // Query mode — convert GraphPayload nodes to OverviewNode shape
      return {
        nodes: graphData.nodes.map((n) => ({
          canonical_id: n.canonical_id,
          name: n.name,
          main_categories: n.main_categories,
          sub_category: n.sub_category,
          connection_count: ccLookup.get(n.canonical_id) ?? 1,
          evidence_doc_id: n.evidence_doc_id ?? null,
          evidence_page: n.evidence_page ?? null,
        })),
        edges: graphData.edges,
      } satisfies GraphOverviewPayload;
    }
    return overviewData;
  }, [isOverviewMode, graphData, overviewData]);

  // ---- Compute label threshold ----
  const isLargeNodeSet = (activeData?.nodes.length ?? 0) > 50;
  const threshold = useMemo(
    () => (activeData ? labelThreshold(activeData.nodes, isOverviewMode || isLargeNodeSet) : 0),
    [activeData, isOverviewMode, isLargeNodeSet],
  );

  // ---- Build Cytoscape elements ----
  const elements = useMemo(() => {
    if (!activeData) return [];

    const nodeEls = activeData.nodes
      .filter(
        (n) =>
          // Hide disconnected nodes in overview (they pack into an ugly grid)
          (!isOverviewMode || n.connection_count > 0) &&
          (!n.main_categories.length ||
            !n.main_categories.every((c) => hiddenCategories.has(c))),
      )
      .map((n) => ({
        data: {
          id: n.canonical_id,
          label: n.name,
          main_categories: n.main_categories[0] ?? "",
          sub_category: n.sub_category ?? "",
          connection_count: n.connection_count,
          size: nodeSize(n.connection_count, isOverviewMode || isLargeNodeSet),
          evidence_doc_id: n.evidence_doc_id ?? null,
          evidence_page: n.evidence_page ?? null,
        },
      }));

    const visibleIds = new Set(nodeEls.map((n) => n.data.id));

    const edgeEls = activeData.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
        },
      }));

    return [...nodeEls, ...edgeEls];
  }, [activeData, hiddenCategories, isOverviewMode]);

  // ---- Initialize Cytoscape ----
  useEffect(() => {
    if (!containerRef.current || elements.length === 0) return;

    // Guard against zero-size container (not yet laid out by browser)
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      const raf = requestAnimationFrame(() => {
        setForceRender((n) => n + 1);
      });
      return () => cancelAnimationFrame(raf);
    }

    // ---- Mode-aware layout parameters ----
    const useOverviewLayout = isOverviewMode || elements.length > 50;
    const layoutOptions = useOverviewLayout
      ? {
          name: "fcose",
          quality: "proof" as const,
          randomize: true,
          animate: true,
          animationDuration: 1200,
          fit: true,
          padding: 80,
          nodeSeparation: 250,
          tile: true,
          packComponents: true,
          gravity: 0.08,
          gravityRange: 8.0,
          edgeElasticity: 0.1,
          numIter: 5000,
          idealEdgeLength: ((edge: cytoscape.EdgeSingular) => {
            const src = edge.source().data("main_categories");
            const tgt = edge.target().data("main_categories");
            return src === tgt ? 180 : 450;
          }) as unknown as number,
          nodeRepulsion: ((node: cytoscape.NodeSingular) => {
            const cc = node.data("connection_count") as number;
            if (cc > 10) return 80000;
            if (cc > 3) return 40000;
            return 20000;
          }) as unknown as number,
        }
      : {
          name: "fcose",
          quality: "proof" as const,
          randomize: true,
          animate: true,
          animationDuration: 600,
          fit: true,
          padding: 40,
          nodeSeparation: 100,
          tile: true,
          packComponents: true,
          gravity: 0.25,
          idealEdgeLength: ((edge: cytoscape.EdgeSingular) => {
            const src = edge.source().data("main_categories");
            const tgt = edge.target().data("main_categories");
            return src === tgt ? 100 : 200;
          }) as unknown as number,
          nodeRepulsion: ((node: cytoscape.NodeSingular) => {
            const cc = node.data("connection_count") as number;
            return cc > 5 ? 10000 : 5000;
          }) as unknown as number,
        };

    // ---- Edge style based on mode ----
    const edgeWidth = useOverviewLayout ? 0.5 : 1.5;
    const edgeOpacity = useOverviewLayout ? 0.15 : 0.4;
    const edgeArrowScale = useOverviewLayout ? 0.3 : 0.5;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": ((ele: cytoscape.NodeSingular) => {
              const cat = ele.data("main_categories") as string;
              return CATEGORY_COLORS[cat] ?? DEFAULT_NODE_COLOR;
            }) as unknown as string,
            "background-opacity": 0.9,
            width: ((ele: cytoscape.NodeSingular) =>
              ele.data("size")) as unknown as number,
            height: ((ele: cytoscape.NodeSingular) =>
              ele.data("size")) as unknown as number,
            label: ((ele: cytoscape.NodeSingular) =>
              ele.data("connection_count") >= threshold
                ? ele.data("label")
                : "") as unknown as string,
            color: "#E5E7EB",
            "font-size": ((ele: cytoscape.NodeSingular) => {
              const cc = ele.data("connection_count") as number;
              if (cc > 10) return "13px";
              if (cc > 3) return "11px";
              return "9px";
            }) as unknown as string,
            "font-family": "Plus Jakarta Sans, system-ui, sans-serif",
            "text-valign": "bottom",
            "text-margin-y": 5,
            "text-background-color": "#1C1917",
            "text-background-opacity": 0.7,
            "text-background-padding": "3px",
            "text-max-width": "120px",
            "text-wrap": "ellipsis",
            "border-width": ((ele: cytoscape.NodeSingular) => {
              const cc = ele.data("connection_count") as number;
              if (cc > 8) return 3;
              if (cc > 3) return 2;
              return 0;
            }) as unknown as number,
            "border-color": ((ele: cytoscape.NodeSingular) => {
              const cat = ele.data("main_categories") as string;
              return CATEGORY_COLORS[cat] ?? DEFAULT_NODE_COLOR;
            }) as unknown as string,
            "border-opacity": 0.3,
          },
        },
        {
          selector: "edge",
          style: {
            width: edgeWidth,
            "line-color": "#4B5563",
            opacity: edgeOpacity,
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "target-arrow-color": "#4B5563",
            "arrow-scale": edgeArrowScale,
          },
        },
        {
          selector: "node:active",
          style: {
            "overlay-opacity": 0,
          },
        },
      ],
      layout: layoutOptions as cytoscape.LayoutOptions,
      minZoom: 0.2,
      maxZoom: 4,
      wheelSensitivity: 0.3,
    });

    // ---- Zoom-to-fit after layout completes ----
    cy.one("layoutstop", () => {
      cy.animate({
        fit: { eles: cy.elements(), padding: useOverviewLayout ? 60 : 30 },
        duration: 400,
        easing: "ease-in-out-cubic",
      });
    });

    // ---- Events ----
    cy.on("tap", "node", (evt: EventObject) => {
      const nodeData = evt.target.data();
      selectNode({
        canonical_id: nodeData.id,
        name: nodeData.label,
        main_categories: nodeData.main_categories
          ? [nodeData.main_categories]
          : [],
        sub_category: nodeData.sub_category || null,
        attributes: {},
        highlighted: true,
        evidence_doc_id: nodeData.evidence_doc_id ?? null,
        evidence_page: nodeData.evidence_page ?? null,
        evidence_text_span: null,
        evidence_confidence: null,
      });
    });

    cy.on("tap", (evt: EventObject) => {
      if (evt.target === cy) selectNode(null);
    });

    // Hover: show label on mouseover
    cy.on("mouseover", "node", (evt: EventObject) => {
      const node = evt.target;
      node.style("label", node.data("label"));
      node.style("border-width", 2);
      node.style("border-color", "#d4ad6a");
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    });

    cy.on("mouseout", "node", (evt: EventObject) => {
      const node = evt.target;
      if (node.data("connection_count") < threshold) {
        node.style("label", "");
      }
      // Restore hub borders instead of resetting to 0
      const cc = node.data("connection_count") as number;
      node.style("border-width", cc > 8 ? 3 : cc > 3 ? 2 : 0);
      node.style(
        "border-color",
        CATEGORY_COLORS[node.data("main_categories") as string] ??
          DEFAULT_NODE_COLOR,
      );
      if (containerRef.current) containerRef.current.style.cursor = "default";
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, threshold, selectNode, isOverviewMode, forceRender]);

  // ---- Reset to overview ----
  const handleResetToOverview = useCallback(() => {
    setOverviewMode(true);
  }, [setOverviewMode]);

  // ---- Loading state ----
  if (!activeData && !overviewError) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-900">
        <div className="text-center animate-fade-in">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border border-stone-700/40 animate-ping" style={{ animationDuration: "3s" }} />
            <div className="absolute inset-3 rounded-full border border-stone-600/30 animate-ping" style={{ animationDuration: "2.5s", animationDelay: "0.5s" }} />
            <div className="absolute inset-6 rounded-full border border-stone-500/20 animate-ping" style={{ animationDuration: "2s", animationDelay: "1s" }} />
            <div className="absolute inset-[2.25rem] rounded-full bg-ink-500/20" />
          </div>
          <p className="text-sm text-stone-400 font-display">Loading knowledge graph&hellip;</p>
          <p className="text-xs text-stone-600 mt-1">
            {retryCount > 0
              ? `Waking up database\u2026 attempt ${retryCount + 1} of 6`
              : "Connecting to archive database"}
          </p>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (overviewError && !activeData) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-900">
        <div className="text-center animate-fade-in">
          <div className="text-3xl mb-3 text-stone-600">&#x26A0;</div>
          <p className="font-display text-base text-stone-300 mb-1">Could not load knowledge graph</p>
          <p className="text-xs text-stone-500 mb-4">The archive database may be waking up from sleep.</p>
          <button
            onClick={() => {
              setOverviewError(false);
              setRetryCount(0);
              let retries = 0;
              const maxRetries = 5;
              const attempt = () => {
                apiClient
                  .getOverview()
                  .then((data) => {
                    setOverviewData(data);
                    setRetryCount(0);
                  })
                  .catch(() => {
                    if (retries < maxRetries) {
                      retries++;
                      setRetryCount(retries);
                      setTimeout(attempt, 3000);
                    } else {
                      setOverviewError(true);
                      setRetryCount(0);
                    }
                  });
              };
              attempt();
            }}
            className="px-4 py-2 text-sm rounded-md bg-stone-800 border border-stone-700 text-stone-300 hover:bg-stone-700 hover:text-stone-100 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-stone-900">
      {/* Cytoscape container */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Reset button (visible in query mode) */}
      {!isOverviewMode && (
        <button
          onClick={handleResetToOverview}
          className="absolute top-3 right-3 z-10 rounded-md bg-stone-800/90 backdrop-blur-sm border border-stone-700/50 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-700 hover:text-stone-100 transition-colors"
        >
          Show Full Graph
        </button>
      )}
    </div>
  );
}
