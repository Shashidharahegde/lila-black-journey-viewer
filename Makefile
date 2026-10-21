.PHONY: test web

test:
	cd pipeline && uv run pytest

web:
	cd web && npm run dev
