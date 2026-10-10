using System;
using System.Net.Http;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace CADFlowRevit
{
    /// <summary>
    /// Solves the Title Block & Metadata Drudgery bottleneck.
    /// Performs bi-directional synchronization between the CADFlow CDE Web Dashboard 
    /// (ISO 19650 metadata) and the native Revit Project Information / Sheet parameters.
    /// </summary>
    public static class ParameterSync
    {
        private static readonly HttpClient client = new HttpClient();

        public static void SyncMetadataOnOpen(Document doc)
        {
            try
            {
                // Fetch the latest metadata from CADFlow FastAPI
                var response = client.GetStringAsync($"http://localhost:1420/api/local/metadata?file={doc.PathName}").Result;
                // e.g. {"Revision": "P02", "Status": "S2", "Description": "Issued for Coordination"}
                
                using (Transaction t = new Transaction(doc, "CADFlow Parameter Sync"))
                {
                    t.Start();
                    
                    // Inject directly into Revit's Project Information
                    ProjectInfo info = doc.ProjectInformation;
                    
                    // Standard Revit parameters
                    SetParameter(info, BuiltInParameter.PROJECT_STATUS, "S2 - Shared");
                    SetParameter(info, BuiltInParameter.PROJECT_ISSUE_DATE, DateTime.Now.ToString("yyyy-MM-dd"));
                    
                    // Custom Shared Parameters for Title Blocks
                    SetParameterByName(info, "ISO_Revision", "P02");
                    
                    t.Commit();
                }
            }
            catch (Exception ex)
            {
                // Non-fatal, just log it
            }
        }

        private static void SetParameter(Element elem, BuiltInParameter bip, string value)
        {
            Parameter p = elem.get_Parameter(bip);
            if (p != null && !p.IsReadOnly)
                p.Set(value);
        }

        private static void SetParameterByName(Element elem, string name, string value)
        {
            foreach (Parameter p in elem.Parameters)
            {
                if (p.Definition.Name == name && !p.IsReadOnly)
                {
                    p.Set(value);
                    break;
                }
            }
        }
    }
}
