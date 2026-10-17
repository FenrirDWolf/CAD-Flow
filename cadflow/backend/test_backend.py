import os
import unittest
import httpx
from main import app
from models import init_db, engine, Base

class TestCADFlowBackend(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.headers = {"X-CADFlow-API-Key": "dev-cadflow-secret-key-123"}
        self.transport = httpx.ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()
        await engine.dispose()

    async def test_01_health_check(self):
        """Verifies health check endpoint returns 200 OK for offline queue worker"""
        response = await self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    async def test_02_lock_concurrency_and_conflict(self):
        """Verifies race condition prevention: second concurrent user receives HTTP 409"""
        item_id = "test_item_dwg_001"
        payload_alice = {
            "sharepoint_item_id": item_id,
            "file_path": "X:\\Project\\TestFloorPlan.dwg",
            "file_type": "dwg",
            "machine_hostname": "ALICE-PC",
            "windows_username": "alice"
        }
        payload_bob = {
            "sharepoint_item_id": item_id,
            "file_path": "X:\\Project\\TestFloorPlan.dwg",
            "file_type": "dwg",
            "machine_hostname": "BOB-PC",
            "windows_username": "bob"
        }

        # Clear existing lock if any
        await self.client.post("/api/v1/locks/break", json={"sharepoint_item_id": item_id}, headers=self.headers)

        # Alice acquires lock
        res_alice = await self.client.post("/api/v1/locks/acquire", json=payload_alice, headers=self.headers)
        self.assertEqual(res_alice.status_code, 200)

        # Bob attempts concurrent acquire on same item -> MUST return 409 Conflict
        res_bob = await self.client.post("/api/v1/locks/acquire", json=payload_bob, headers=self.headers)
        self.assertEqual(res_bob.status_code, 409)
        self.assertIn("locked by alice", res_bob.json()["detail"].lower())

    async def test_03_lock_heartbeat(self):
        """Verifies active lock receives heartbeat and unknown lock returns 404"""
        item_id = "test_item_dwg_001"
        res_hb = await self.client.post("/api/v1/locks/heartbeat", json={"sharepoint_item_id": item_id}, headers=self.headers)
        self.assertEqual(res_hb.status_code, 200)

        res_unknown = await self.client.post("/api/v1/locks/heartbeat", json={"sharepoint_item_id": "non_existent_item"}, headers=self.headers)
        self.assertEqual(res_unknown.status_code, 404)

    async def test_04_unauthorized_release_rejected(self):
        """Verifies security check: unauthorized user cannot release someone else's lock"""
        item_id = "test_item_dwg_001"
        payload_bob_release = {
            "sharepoint_item_id": item_id,
            "machine_hostname": "BOB-PC",
            "windows_username": "bob"
        }
        res = await self.client.post("/api/v1/locks/release", json=payload_bob_release, headers=self.headers)
        self.assertEqual(res.status_code, 403)

    async def test_05_authorized_release(self):
        """Verifies lock holder can release their own lock"""
        item_id = "test_item_dwg_001"
        payload_alice_release = {
            "sharepoint_item_id": item_id,
            "machine_hostname": "ALICE-PC",
            "windows_username": "alice"
        }
        res = await self.client.post("/api/v1/locks/release", json=payload_alice_release, headers=self.headers)
        self.assertEqual(res.status_code, 200)

        # Status check confirms lock is released
        res_status = await self.client.get(f"/api/v1/locks/status/{item_id}", headers=self.headers)
        self.assertIsNone(res_status.json()["locked_by"])

    async def test_06_bim_manager_break_lock(self):
        """Verifies BIM manager override forcefully breaks locks"""
        item_id = "test_item_dwg_002"
        await self.client.post("/api/v1/locks/acquire", json={
            "sharepoint_item_id": item_id,
            "file_path": "X:\\Project\\Site.dwg",
            "file_type": "dwg",
            "machine_hostname": "ALICE-PC",
            "windows_username": "alice"
        }, headers=self.headers)

        res_break = await self.client.post("/api/v1/locks/break", json={"sharepoint_item_id": item_id}, headers=self.headers)
        self.assertEqual(res_break.status_code, 200)

        res_status = await self.client.get(f"/api/v1/locks/status/{item_id}", headers=self.headers)
        self.assertIsNone(res_status.json()["locked_by"])

    async def test_07_revit_lifecycle_router_mounted(self):
        """Verifies revit lifecycle router is mounted in main app"""
        res = await self.client.get("/api/v1/revit-lifecycle/status")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["server_status"], "ONLINE")

    async def test_08_revit_lifecycle_publish_snapshot(self):
        """Verifies publish snapshot endpoint returns success with formatted snapshot name"""
        payload = {"model_name": "HUB-AR-ZZ-MD-M3-0001_Central.rvt", "comment": "Milestone Test"}
        res = await self.client.post("/api/v1/revit-lifecycle/publish-snapshot", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "success")
        self.assertIn("_Snapshot_", res.json()["snapshot_filename"])

if __name__ == "__main__":
    unittest.main()
