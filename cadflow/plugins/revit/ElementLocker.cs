using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace CADFlowRevit
{
    /// <summary>
    /// Implements real-time Element-Level Worksharing.
    /// Replaces the monolithic "Wait for entire file" queue with true granular BIM 360 style locking.
    /// </summary>
    public class ElementLocker : IUpdater
    {
        private static readonly HttpClient client = new HttpClient();
        static UpdaterId m_updaterId = null;

        public ElementLocker(AddInId id)
        {
            m_updaterId = new UpdaterId(id, new Guid("98765432-1234-1234-1234-123456789012"));
        }

        public void Execute(UpdaterData data)
        {
            Document doc = data.GetDocument();
            ICollection<ElementId> modifiedElementIds = data.GetModifiedElementIds();

            foreach (ElementId id in modifiedElementIds)
            {
                // Attempt to grab a distributed lock on this specific element in CADFlow FastAPI/Redis
                bool canEdit = TryLockElementInCadFlow(doc.Title, id.IntegerValue);
                
                if (!canEdit)
                {
                    TaskDialog.Show("CADFlow", string.Format("Element {0} is currently locked by another user.", id.IntegerValue));
                    // Throwing exception cancels the transaction in Revit natively
                    throw new Exception("Element locked by another user."); 
                }
            }
        }

        private bool TryLockElementInCadFlow(string documentName, int elementId)
        {
            try
            {
                // Fire-and-forget fast lock request to local CADFlow Desktop Agent
                var payload = new StringContent(string.Format("{{\"file\":\"{0}\", \"element_id\":{1}}}", documentName, elementId), Encoding.UTF8, "application/json");
                // Using synchronous Wait for demonstration, in production use async or pre-fetch locks
                var response = client.PostAsync("http://localhost:1420/api/local/elements/lock", payload).Result;
                return response.IsSuccessStatusCode;
            }
            catch
            {
                // Default to deny if CADFlow is unreachable
                return false; 
            }
        }

        public string GetAdditionalInformation() { return "CADFlow Element Locker"; }
        public ChangePriority GetChangePriority() { return ChangePriority.MEPFixtures; }
        public UpdaterId GetUpdaterId() { return m_updaterId; }
        public string GetUpdaterName() { return "CADFlow Element Locker"; }
    }
}
