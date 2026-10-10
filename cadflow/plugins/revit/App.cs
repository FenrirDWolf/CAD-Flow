using System;
using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;

namespace CADFlowRevit
{
    public class App : IExternalApplication
    {
        public Result OnStartup(UIControlledApplication application)
        {
            // Register Sync-to-Central Interceptor
            application.ControlledApplication.DocumentSynchronizingWithCentral += 
                new EventHandler<DocumentSynchronizingWithCentralEventArgs>(SyncInterceptor.OnDocumentSynchronizing);
            
            // Register BCF Camera bi-directional sync (listen for IPC events from desktop)
            // CameraSync.StartListening();

            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            application.ControlledApplication.DocumentSynchronizingWithCentral -= 
                new EventHandler<DocumentSynchronizingWithCentralEventArgs>(SyncInterceptor.OnDocumentSynchronizing);
            
            return Result.Succeeded;
        }
    }
}
