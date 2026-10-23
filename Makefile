.PHONY: setup requirements data test web check-ids

setup:
	cd pipeline && uv sync
	cd web && npm ci

requirements:
	cd pipeline && uv export --format requirements-txt --no-hashes --no-emit-project -o requirements.txt

data:
	cd pipeline && uv run python -m lila_pipeline.build

test:
	cd pipeline && uv run pytest

web:
	cd web && npm run dev

check-ids:
	cd pipeline && uv run python tools/check_ids.py
