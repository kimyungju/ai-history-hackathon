from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # GCP
    GCP_PROJECT_ID: str = "PLACEHOLDER_GCP_PROJECT_ID"
    GCP_REGION: str = "PLACEHOLDER_GCP_REGION"

    # Document AI
    DOC_AI_PROCESSOR_ID: str = "PLACEHOLDER_DOC_AI_PROCESSOR_ID"

    # Vertex AI Embeddings
    VERTEX_EMBED_MODEL: str = "text-embedding-004"

    # Vertex AI Vector Search
    VECTOR_SEARCH_ENDPOINT: str = "PLACEHOLDER_VECTOR_SEARCH_ENDPOINT"
    VECTOR_SEARCH_INDEX_ID: str = "PLACEHOLDER_VECTOR_SEARCH_INDEX_ID"
    VECTOR_SEARCH_DEPLOYED_INDEX_ID: str = "PLACEHOLDER_DEPLOYED_INDEX_ID"

    # Vertex AI LLM
    VERTEX_LLM_MODEL: str = "gemini-2.0-flash"
    VERTEX_LLM_REGION: str = "us-central1"  # Gemini not available in all regions

    # Neo4j (Phase 2)
    NEO4J_URI: str = "PLACEHOLDER_NEO4J_URI"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "PLACEHOLDER_NEO4J_PASSWORD"

    # Cloud Storage
    CLOUD_STORAGE_BUCKET: str = "PLACEHOLDER_GCS_BUCKET_NAME"

    # Pub/Sub (Phase 4)
    PUBSUB_TOPIC: str = "PLACEHOLDER_PUBSUB_TOPIC"

    # Tavily (Phase 4)
    TAVILY_API_KEY: str = "PLACEHOLDER_TAVILY_API_KEY"

    # Thresholds
    RELEVANCE_THRESHOLD: float = 0.7
    OCR_CONFIDENCE_FLAG: float = 0.5
    CHUNK_SIZE_TOKENS: int = 450
    CHUNK_OVERLAP_TOKENS: int = 100
    GRAPH_HOP_DEPTH: int = 3
    VECTOR_TOP_K: int = 10

    # Entity extraction (Phase 2)
    ENTITY_SIMILARITY_THRESHOLD: float = 0.85
    ENTITY_CONFIDENCE_MIN: float = 0.5

    # Auto-classification (Phase 4)
    CLASSIFICATION_CONFIDENCE_MIN: float = 0.8

    # Signed URL
    SIGNED_URL_EXPIRY_MINUTES: int = 15

    class Config:
        env_file = ".env"


settings = Settings()
