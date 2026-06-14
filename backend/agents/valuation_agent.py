"""
EcoLoop AI - Valuation Agent

Estimates product resale value using category-specific depreciation rates
and condition-grade multipliers.

Pipeline position: Agent 2 of 5
Input: condition_grade (from Vision Agent) + product metadata (category, age, price)
Output: base_value, resale_value_min, resale_value_max
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger("ecoloop.valuation_agent")

# Category-specific monthly depreciation rates
DEPRECIATION_RATES: dict[str, float] = {
    "Electronics": 0.025,
    "Clothing": 0.030,
    "Furniture": 0.010,
    "Books": 0.005,
    "Toys": 0.020,
    "Appliances": 0.015,
    "Sports Equipment": 0.018,
}

# Condition grade multipliers
CONDITION_MULTIPLIERS: dict[str, float] = {
    "A": 1.0,
    "B": 0.8,
    "C": 0.55,
    "D": 0.3,
}


@dataclass
class ValuationResult:
    """Output from the Valuation Agent."""

    base_value: float       # Core resale value before range calculation
    resale_min: float       # Minimum estimate (base × 0.85)
    resale_max: float       # Maximum estimate (base × 1.15)
    display: str            # Human-readable range string
    has_significant_value: bool  # False when value < ₹1


class ValuationAgent:
    """
    Valuation Agent — estimates resale value using depreciation formula.

    Formula: resale_value = original_price × (1 - monthly_rate × age_months) × condition_multiplier

    Responsibilities:
    - Apply category-specific depreciation rates
    - Apply condition grade multipliers
    - Cap value at zero (no negative values)
    - Compute min/max range (±15%)
    - Flag products with no significant resale value (< ₹1)
    """

    def calculate(
        self,
        condition_grade: str,
        product_category: str,
        product_age_months: int,
        original_price: float,
    ) -> ValuationResult:
        """
        Calculate estimated resale value.

        Args:
            condition_grade: A, B, C, or D (from Vision Agent).
            product_category: Product category string.
            product_age_months: Product age in months (0-240).
            original_price: Original purchase price in USD.

        Returns:
            ValuationResult with base value, min/max range, and display string.
        """
        logger.info(
            f"Calculating: grade={condition_grade}, category={product_category}, "
            f"age={product_age_months}mo, price=₹{original_price:.2f}"
        )

        # Get depreciation rate (default 2% if category unknown)
        monthly_rate = DEPRECIATION_RATES.get(product_category, 0.02)

        # Get condition multiplier (default 0.5 if grade unknown)
        multiplier = CONDITION_MULTIPLIERS.get(condition_grade, 0.5)

        # Apply depreciation formula
        depreciation_factor = 1 - (monthly_rate * product_age_months)

        # Cap depreciation factor at 0 (value cannot go negative)
        depreciation_factor = max(0, depreciation_factor)

        # Calculate base resale value
        base_value = original_price * depreciation_factor * multiplier

        # Cap at zero
        base_value = max(0, base_value)

        # Check significance threshold
        has_significant_value = base_value >= 1.0

        # Compute range
        if has_significant_value:
            resale_min = round(base_value * 0.85, 2)
            resale_max = round(base_value * 1.15, 2)
            display = f"₹{resale_min:.0f} - ₹{resale_max:.0f}"
        else:
            resale_min = 0.0
            resale_max = 0.0
            display = "No significant resale value"

        result = ValuationResult(
            base_value=round(base_value, 2),
            resale_min=resale_min,
            resale_max=resale_max,
            display=display,
            has_significant_value=has_significant_value,
        )

        logger.info(
            f"Result: base=₹{result.base_value:.2f}, "
            f"range={result.display}, "
            f"significant={result.has_significant_value}"
        )

        return result


# Module-level singleton
valuation_agent = ValuationAgent()
