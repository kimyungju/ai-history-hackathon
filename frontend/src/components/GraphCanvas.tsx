import { useRef, useCallback, useMemo, useEffect } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type cytoscape from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
import Cytoscape from "cytoscape";
import { useAppStore } from "../stores/useAppStore";

// Register layout extension once
// eslint-disable-next-line react-hooks/rules-of-hooks
Cytoscape.use(coseBilkent);

const CATEGORY_COLORS: Record<string, string> = {
  "Internal Relations and Research": "#8B5CF6", // violet
  "Economic and Financial": "#F59E0B",          // amber
  "Social Services": "#10B981",                  // emerald
  "Defence and Military": "#EF4444",             // red
  "General and Establishment": "#3B82F6",        // blue
};

const DEFAULT_COLOR = "#6B7280"; // gray

function getCategoryColor(categories: string[]): string {
  if (categories.length === 0) return DEFAULT_COLOR;
  return CATEGORY_COLORS[categories[0]] ?? DEFAULT_COLOR;
}

export default function GraphCanvas() {
  const graphData = useAppStore((s) => s.graphData);
  const selectNode = useAppStore((s) => s.selectNode);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const elements = useMemo(() => {
    if (!graphData) return [];

    const nodes = graphData.nodes.map((n) => ({
      data: {
        id: n.canonical_id,
        label: n.name.length > 20 ? n.name.slice(0, 18) + "..." : n.name,
        fullName: n.name,
        ...n,
        color: getCategoryColor(n.main_categories),
      },
    }));

    const edges = graphData.edges.map((e) => ({
      data: {
        ...e,
        label: e.type.replace(/_/g, " "),
      },
    }));

    return [...nodes, ...edges];
  }, [graphData]);

  // Cytoscape stylesheet — typed as any[] because react-cytoscapejs
  // uses `style` while @types/cytoscape expects `css` in StylesheetCSS
  const stylesheet = useMemo(
    () => [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "background-color": "data(color)",
          "text-valign": "bottom",
          "text-halign": "center",
          "font-size": "10px",
          "font-family": "'Plus Jakarta Sans', system-ui, sans-serif",
          color: "#d6d3d1",
          "text-margin-y": 6,
          width: 40,
          height: 40,
          shape: "round-rectangle",
          "border-width": 2,
          "border-color": "data(color)",
        },
      },
      {
        selector: "node[?highlighted]",
        style: {
          "border-color": "#d4ad6a",
          "border-width": 4,
          "background-color": "data(color)",
        },
      },
      {
        selector: "node:active",
        style: {
          "overlay-opacity": 0.1,
        },
      },
      {
        selector: "edge",
        style: {
          label: "data(label)",
          "curve-style": "bezier",
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.8,
          "line-color": "#57534e",
          "target-arrow-color": "#57534e",
          "font-size": "8px",
          "font-family": "'Plus Jakarta Sans', system-ui, sans-serif",
          color: "#a8a29e",
          "text-rotation": "autorotate",
          width: 1.5,
        },
      },
      {
        selector: "edge[?highlighted]",
        style: {
          "line-color": "#d4ad6a",
          "target-arrow-color": "#d4ad6a",
          width: 3,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any,
    []
  );

  const handleCyInit = useCallback(
    (cy: cytoscape.Core) => {
      cyRef.current = cy;

      cy.on("tap", "node", (evt) => {
        const nodeData = evt.target.data();
        selectNode({
          canonical_id: nodeData.canonical_id,
          name: nodeData.fullName ?? nodeData.name,
          main_categories: nodeData.main_categories ?? [],
          sub_category: nodeData.sub_category ?? null,
          attributes: nodeData.attributes ?? {},
          highlighted: nodeData.highlighted ?? false,
        });
      });

      cy.on("tap", (evt) => {
        if (evt.target === cy) {
          selectNode(null);
        }
      });
    },
    [selectNode]
  );

  // Animate camera to highlighted nodes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graphData) return;

    const highlighted = cy.nodes("[?highlighted]");
    if (highlighted.length > 0) {
      // Dim non-highlighted elements
      cy.elements().style("opacity", 0.4);
      highlighted.style("opacity", 1);
      highlighted.connectedEdges().style("opacity", 1);
      highlighted.connectedEdges().targets().style("opacity", 1);
      highlighted.connectedEdges().sources().style("opacity", 1);

      cy.animate({
        fit: { eles: highlighted, padding: 60 },
        duration: 800,
        easing: "ease-out-cubic",
      });
    } else {
      cy.elements().style("opacity", 1);
      cy.fit(undefined, 40);
    }
  }, [graphData]);

  const hasMessages = useAppStore((s) => s.messages.length > 0);

  if (!graphData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-xs animate-fade-in">
          {hasMessages ? (
            <>
              <div className="flex justify-center gap-3 text-stone-700 text-lg mb-3 select-none">
                <span>&#9675;</span>
              </div>
              <h3 className="font-display text-base font-medium text-stone-400">
                No Entities Found
              </h3>
              <p className="text-stone-600 text-sm mt-1.5">
                No graph entities were found for this query. Try searching for specific names, places, or organizations.
              </p>
            </>
          ) : (
            <>
              <div className="flex justify-center gap-3 text-stone-700 text-lg mb-3 select-none">
                <span>&#9671;</span><span>&#9671;</span><span>&#9671;</span>
              </div>
              <h3 className="font-display text-base font-medium text-stone-400">
                Knowledge Graph
              </h3>
              <p className="text-stone-600 text-sm mt-1.5">
                Ask a question or search for an entity to explore the document network.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <CytoscapeComponent
      elements={elements}
      stylesheet={stylesheet}
      layout={{
        name: "cose-bilkent",
        animate: true,
        animationDuration: 600,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 120,
        nodeRepulsion: 6000,
        gravity: 0.25,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any}
      cy={handleCyInit}
      className="w-full h-full"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
