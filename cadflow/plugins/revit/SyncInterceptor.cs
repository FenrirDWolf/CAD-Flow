using System;
using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace CADFlow.RevitPlugin
{
    public class SyncInterceptor : IExternalApplication
    {
        private static readonly HttpClient client = new HttpClient();
        private static readonly string backendBaseUrl = Environment.GetEnvironmentVariable("CADFLOW_API_URL") ?? "https://cadflow-api.onrender.com";
        private static string lastOpenedFilePath = "";
        
        public SyncInterceptor()
        {
            string apiKey = Environment.GetEnvironmentVariable("CADFLOW_API_KEY") ?? "dev-cadflow-secret-key-123";
            client.DefaultRequestHeaders.Add("X-CADFlow-API-Key", apiKey);
        }
        
        public Result OnStartup(UIControlledApplication application)
        {
            application.ControlledApplication.DocumentOpening += OnDocumentOpening;
            application.ControlledApplication.DocumentSaved += OnDocumentSaved;
            application.ControlledApplication.DocumentClosed += OnDocumentClosed;
            application.ControlledApplication.DocumentSynchronizingWithCentral += OnDocumentSynchronizing;
            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            application.ControlledApplication.DocumentOpening -= OnDocumentOpening;
            application.ControlledApplication.DocumentSaved -= OnDocumentSaved;
            application.ControlledApplication.DocumentClosed -= OnDocumentClosed;
            application.ControlledApplication.DocumentSynchronizingWithCentral -= OnDocumentSynchronizing;
            return Result.Succeeded;
        }

        public static void OnDocumentSynchronizing(object sender, DocumentSynchronizingWithCentralEventArgs e)
        {
            string path = e.Document != null ? e.Document.PathName : "";
            if (!string.IsNullOrEmpty(path))
            {
                Task.Run(() => new SyncInterceptor().LogAuditAction(path, "sync", "Revit Interceptor synchronized with Central.")).Wait();
            }
        }

        private static string GetDeterministicItemId(string filePath)
        {
            string fileName = System.IO.Path.GetFileName(filePath) ?? "revit_generic";
            return "rvt_" + Math.Abs(fileName.ToLowerInvariant().GetHashCode()).ToString();
        }

        private void OnDocumentOpening(object sender, DocumentOpeningEventArgs e)
        {
            string filePath = e.PathName;
            if (filePath.Contains("X:\\") || filePath.Contains("CADFlow"))
            {
                lastOpenedFilePath = filePath;
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

        private void OnDocumentClosed(object sender, DocumentClosedEventArgs e)
        {
            if (!string.IsNullOrEmpty(lastOpenedFilePath))
            {
                string path = lastOpenedFilePath;
                lastOpenedFilePath = "";
                Task.Run(() => ReleaseLock(path)).Wait();
                Task.Run(() => LogAuditAction(path, "unlock", "Revit Interceptor released lock on file close.")).Wait();
            }
        }

        private static string Escape(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
        }

        private async Task<bool> AcquireLock(string filePath)
        {
            try
            {
                string itemId = GetDeterministicItemId(filePath);
                string json = string.Format("{{\"file_path\":\"{0}\",\"sharepoint_item_id\":\"{1}\",\"file_type\":\"rvt\",\"machine_hostname\":\"{2}\",\"windows_username\":\"{3}\"}}",
                    Escape(filePath), Escape(itemId), Escape(Environment.MachineName), Escape(Environment.UserName));
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync(string.Format("{0}/api/v1/locks/acquire", backendBaseUrl), content).ConfigureAwait(false);
                return response.IsSuccessStatusCode;
            }
            catch
            {
                return false;
            }
        }

        private async Task<bool> ReleaseLock(string filePath)
        {
            try
            {
                string itemId = GetDeterministicItemId(filePath);
                string json = string.Format("{{\"sharepoint_item_id\":\"{0}\",\"machine_hostname\":\"{1}\",\"windows_username\":\"{2}\",\"comment\":\"Revit document closed\"}}",
                    Escape(itemId), Escape(Environment.MachineName), Escape(Environment.UserName));
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync(string.Format("{0}/api/v1/locks/release", backendBaseUrl), content).ConfigureAwait(false);
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
                string itemId = GetDeterministicItemId(filePath);
                string json = string.Format("{{\"sharepoint_item_id\":\"{0}\",\"file_name\":\"{1}\",\"clerk_id\":\"{2}\",\"action\":\"{3}\",\"details\":\"{4}\"}}",
                    Escape(itemId), Escape(fileName), Escape(Environment.UserName), Escape(action), Escape(details));
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                await client.PostAsync(string.Format("{0}/api/v1/audit/log", backendBaseUrl), content).ConfigureAwait(false);
            }
            catch { }
        }
    }
}
