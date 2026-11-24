import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app import seed
from app.db import Base, get_db, make_engine
from app.main import app


@pytest.fixture()
def session_factory(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    yield factory
    engine.dispose()


@pytest.fixture()
def client(session_factory):
    with session_factory() as db:
        seed.run(db)

    def override():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app, headers={"X-Actor": "tester"}) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def graph(client):
    return client.get("/api/graph").json()


def find(graph, title):
    return next(n for n in graph["nodes"] if n["title"] == title)
