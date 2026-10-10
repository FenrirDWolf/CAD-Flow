using System;
using System.IO;
using Autodesk.AutoCAD.Runtime;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;

namespace CADFlowAutoCAD
{
    /// <summary>
    /// Solves the AutoCAD XREF Repathing problem without requiring the massive ODA SDK.
    /// Injected via command line when CADFlow launches AutoCAD.
    /// </summary>
    public class XrefRepather
    {
        [CommandMethod("CADFLOW_REPATH_XREFS")]
        public void RepathXrefs()
        {
            Document doc = Application.DocumentManager.MdiActiveDocument;
            Database db = doc.Database;

            using (Transaction tr = db.TransactionManager.StartTransaction())
            {
                doc.Editor.WriteMessage("\n[CADFlow] Scanning for hardcoded XREFs...");

                BlockTable bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
                
                foreach (ObjectId btrId in bt)
                {
                    BlockTableRecord btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
                    
                    if (btr.IsFromExternalReference)
                    {
                        string oldPath = btr.PathName;
                        if (Path.IsPathRooted(oldPath) && !oldPath.StartsWith("X:\\"))
                        {
                            // It's a hardcoded C:\ drive path. Rewrite it to a relative path.
                            string fileName = Path.GetFileName(oldPath);
                            string newRelativePath = ".\\" + fileName;
                            
                            btr.UpgradeOpen();
                            btr.PathName = newRelativePath;
                            
                            doc.Editor.WriteMessage($"\n[CADFlow] Repathed {fileName} to {newRelativePath}");
                        }
                    }
                }
                tr.Commit();
            }
        }
    }
}
