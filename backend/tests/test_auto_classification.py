"""Tests for auto-classification service."""

import pytest
from unittest.mock import patch, MagicMock

from app.services.auto_classification import auto_classification_service
from app.models.schemas import MAIN_CATEGORIES


@pytest.mark.asyncio
async def test_classify_returns_valid_category():
    """classify() returns a category from MAIN_CATEGORIES and a confidence score."""
    mock_response = MagicMock()
    mock_response.text = '{"category": "Economic and Financial", "confidence": 0.92}'

    with patch.object(
        type(auto_classification_service), "model",
        new_callable=lambda: property(lambda self: MagicMock(generate_content=MagicMock(return_value=mock_response)))
    ):
        category, confidence = await auto_classification_service.classify(
            "Revenue from import duties on wines and spirits in the Straits Settlements."
        )

    assert category in MAIN_CATEGORIES
    assert category == "Economic and Financial"
    assert 0.0 <= confidence <= 1.0


@pytest.mark.asyncio
async def test_classify_returns_general_on_invalid_json():
    """classify() returns General and Establishment with low confidence on parse error."""
    mock_response = MagicMock()
    mock_response.text = "not valid json"

    with patch.object(
        type(auto_classification_service), "model",
        new_callable=lambda: property(lambda self: MagicMock(generate_content=MagicMock(return_value=mock_response)))
    ):
        category, confidence = await auto_classification_service.classify("some text")

    assert category == "General and Establishment"
    assert confidence < 0.5


@pytest.mark.asyncio
async def test_classify_returns_general_on_exception():
    """classify() returns General and Establishment on LLM error."""
    with patch.object(
        type(auto_classification_service), "model",
        new_callable=lambda: property(lambda self: MagicMock(generate_content=MagicMock(side_effect=Exception("API error"))))
    ):
        category, confidence = await auto_classification_service.classify("some text")

    assert category == "General and Establishment"
    assert confidence == 0.0
