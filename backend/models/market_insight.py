"""MarketInsight model - Research & Competitor Analysis"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project


class MarketInsight(Base):
    __tablename__ = "market_insights"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))

    # Market data
    industry: Mapped[str | None] = mapped_column(String(100))
    market_size_tam: Mapped[str | None] = mapped_column(String(100))  # Total Addressable Market
    market_size_sam: Mapped[str | None] = mapped_column(
        String(100)
    )  # Serviceable Addressable Market
    market_size_som: Mapped[str | None] = mapped_column(
        String(100)
    )  # Serviceable Obtainable Market
    cagr: Mapped[float | None] = mapped_column(Float)  # Compound Annual Growth Rate

    # Competitor analysis
    competitor_name: Mapped[str | None] = mapped_column(String(100))
    competitor_strengths: Mapped[Any | None] = mapped_column(JSON)
    competitor_weaknesses: Mapped[Any | None] = mapped_column(JSON)
    market_position: Mapped[str | None] = mapped_column(String(100))

    # Trends & Insights
    trend: Mapped[str | None] = mapped_column(String(255))
    trend_analysis: Mapped[str | None] = mapped_column(Text)
    opportunity: Mapped[str | None] = mapped_column(Text)
    threat: Mapped[str | None] = mapped_column(Text)

    # SWOT
    swot: Mapped[Any | None] = mapped_column(
        JSON
    )  # {strengths, weaknesses, opportunities, threats}

    insight_type: Mapped[str | None] = mapped_column(
        String(50)
    )  # competitor, trend, opportunity, threat

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="market_insights")
