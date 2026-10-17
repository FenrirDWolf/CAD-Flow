using System;
using System.IO;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;

namespace CADFlowRevit
{
    /// <summary>
    /// Solves the "Rogue Family" Model Bloat bottleneck.
    /// Intercepts family loading to prevent 50MB toilets from crashing the Central Model.
    /// </summary>
    public static class FamilyQuarantine
    {
        public static void OnFamilyLoadingIntoDocument(object sender, FamilyLoadingIntoDocumentEventArgs e)
        {
            string familyPath = e.FamilyPath;
            if (string.IsNullOrEmpty(familyPath)) return;

            // 1. Check File Size Constraint
            FileInfo fi = new FileInfo(familyPath);
            long megabytes = fi.Length / (1024 * 1024);

            if (megabytes > 3) // Hard limit: 3MB per family
            {
                TaskDialog.Show("CADFlow Content Quarantine", 
                    string.Format("The family '{0}' is {1}MB. \n\n" +
                    "This exceeds the firm's 3MB standard and will bloat the Central Model. " +
                    "Please request the BIM Manager to simplify the geometry before loading.", Path.GetFileName(familyPath), megabytes));
                
                // Block the family from loading natively
                e.Cancel();
                return;
            }

            // 2. Check Central Library Origin Constraint
            // If the firm requires families to only come from the approved X:\Library\
            if (!familyPath.StartsWith(@"X:\BIM_Library", StringComparison.OrdinalIgnoreCase))
            {
                TaskDialogResult res = TaskDialog.Show("CADFlow Warning", 
                    "You are loading an untrusted family from outside the approved BIM Library. " +
                    "Are you sure you want to proceed?", 
                    TaskDialogCommonButtons.Yes | TaskDialogCommonButtons.No);

                if (res == TaskDialogResult.No)
                {
                    e.Cancel();
                }
            }
        }
    }
}
