using System;
using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json;

namespace CADFlow.Revit
{
    public class SyncInterceptor : IExternalApplication
    {
        private static readonly HttpClient client = new HttpClient();
        
        public SyncInterceptor()
        {
            client.DefaultRequestHeaders.Add("X-CADFlow-API-Key", "dev-cadflow-secret-key-123");
        }
        
        public Result OnStartup(UIControlledApplication application)
        {
            application.ControlledApplication.DocumentOpening += OnDocumentOpening;
            application.ControlledApplication.DocumentSaved += OnDocumentSaved;
            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            application.ControlledApplication.DocumentOpening -= OnDocumentOpening;
            application.ControlledApplication.DocumentSaved -= OnDocumentSaved;
            return Result.Succeeded;
        }

        private void OnDocumentOpening(object sender, DocumentOpeningEventArgs e)
        {
            string filePath = e.PathName;
            if (filePath.Contains("X:\\") || filePath.Contains("CADFlow"))
            {
                bool locked = Task.Run(() => AcquireLock(filePath)).GetAwaiter().GetResult();
                if (!locked)
                {
                    TaskDialog.Show("CADFlow - Access Denied", "This Revit model is currently locked by another user in the Cloud. You can only open it in Read-Only mode to avoid corruption.");
                    e.Cancel();
                }
                else
                {
                    Task.Run(() => LogAuditAction(filePath, "lock", "Revit Interceptor acquired pessimistic lock.")).Wait();
                }
            }
        }

        private void OnDocumentSaved(object sender, DocumentSavedEventArgs e)
        {
            string filePath = e.Document.PathName;
            if (filePath.Contains("X:\\") || filePath.Contains("CADFlow"))
            {
                Task.Run(() => LogAuditAction(filePath, "edit", "Revit Interceptor successfully pushed changes to CADFlow Server.")).Wait();
            }
        }

        private async Task<bool> AcquireLock(string filePath)
        {
            try
            {
                var payload = new { file_path = filePath, sharepoint_item_id = "revit_file_intercept", machine_hostname = Environment.MachineName, windows_username = Environment.UserName };
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync("http://127.0.0.1:8080/api/v1/locks/acquire", content).ConfigureAwait(false);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        private async Task LogAuditAction(string filePath, string action, string details)
        {
            try
            {
                string fileName = System.IO.Path.GetFileName(filePath);
                var payload = new { sharepoint_item_id = $"{fileName}_id", file_name = fileName, clerk_id = "revit_interceptor", action = action, details = details };
                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                await client.PostAsync("http://127.0.0.1:8080/api/v1/audit/log", content).ConfigureAwait(false);
            }
            catch { }
        }
    }
}
