"""Online payment gateway adapters.

Spec §13: research the Pakistani gateways, let the owner choose, then implement only the chosen one using sandbox keys
stored server-side (Portal Integration Settings, encrypted). Until then clients pay by bank / Raast / JazzCash /
Easypaisa transfer and upload proof (services/billing.py).
"""

IMPLEMENTED: dict[str, type] = {}  # gateway name -> adapter class, added when a gateway is chosen and built


def is_implemented(gateway: str | None) -> bool:
	return bool(gateway) and gateway in IMPLEMENTED
