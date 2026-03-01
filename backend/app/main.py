import logging

import vertexai
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.logging_config import setup_logging
from app.config.settings import settings
from app.middleware.trace import TraceMiddleware
from app.routers import ingest, query, graph
from app.routers.admin import router as admin_router
from app.services.neo4j_service import neo4j_service

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    vertexai.init(
        project=settings.GCP_PROJECT_ID,
        location=settings.GCP_REGION,
    )
    # Verify Neo4j connectivity on startup
    neo4j_ok = await neo4j_service.verify_connectivity()
    if neo4j_ok:
        logger.info("Neo4j connection verified")
    else:
        logger.warning("Neo4j not reachable — graph features will fail")
    yield
    await neo4j_service.close()


app = FastAPI(
    title="Colonial Archives Graph-RAG",
    description="Source-grounded Q&A over colonial-era archive documents",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(TraceMiddleware)


app.include_router(ingest.router)
app.include_router(query.router)
app.include_router(graph.router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    neo4j_ok = await neo4j_service.verify_connectivity()
    return {"status": "ok", "neo4j": "connected" if neo4j_ok else "disconnected"}
