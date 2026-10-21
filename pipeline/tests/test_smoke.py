import lila_pipeline


def test_package_imports_and_has_version() -> None:
    assert lila_pipeline.__version__
