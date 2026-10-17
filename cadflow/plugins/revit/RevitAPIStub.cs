using System;
using System.Collections.Generic;

namespace Autodesk.Revit.UI
{
    public enum Result { Succeeded, Failed, Cancelled }
    
    public interface IExternalApplication
    {
        Result OnStartup(UIControlledApplication application);
        Result OnShutdown(UIControlledApplication application);
    }
    
    public class UIControlledApplication
    {
        private Autodesk.Revit.DB.ControlledApplication _app = new Autodesk.Revit.DB.ControlledApplication();
        public Autodesk.Revit.DB.ControlledApplication ControlledApplication 
        { 
            get { return _app; } 
            set { _app = value; } 
        }
    }
    
    public class UIApplication
    {
        private UIDocument _doc = new UIDocument();
        public UIDocument ActiveUIDocument 
        { 
            get { return _doc; } 
            set { _doc = value; } 
        }
    }
    
    public class UIDocument
    {
        private Autodesk.Revit.DB.Document _doc = new Autodesk.Revit.DB.Document();
        public Autodesk.Revit.DB.Document Document 
        { 
            get { return _doc; } 
            set { _doc = value; } 
        }
        public void RefreshActiveView() {}
    }
    
    public class View3D : Autodesk.Revit.DB.Element
    {
        public void SetOrientation(ViewOrientation3D orientation) {}
    }
    
    public class ViewOrientation3D
    {
        public ViewOrientation3D(Autodesk.Revit.DB.XYZ eye, Autodesk.Revit.DB.XYZ up, Autodesk.Revit.DB.XYZ forward) {}
    }
    
    public enum TaskDialogResult { None, Ok, Cancel, Retry, Yes, No, Close }
    
    [Flags]
    public enum TaskDialogCommonButtons { None = 0, Ok = 1, Yes = 2, No = 4, Cancel = 8, Retry = 16, Close = 32 }
    
    public static class TaskDialog
    {
        public static TaskDialogResult Show(string title, string mainInstruction, TaskDialogCommonButtons buttons)
        {
            Console.WriteLine(string.Format("[Revit TaskDialog] {0}: {1}", title, mainInstruction));
            return TaskDialogResult.Ok;
        }

        public static TaskDialogResult Show(string title, string mainInstruction)
        {
            return Show(title, mainInstruction, TaskDialogCommonButtons.Ok);
        }
    }
}

namespace Autodesk.Revit.DB
{
    public class Document
    {
        private string _path = "";
        private string _title = "";
        private ProjectInfo _info = new ProjectInfo();

        public string PathName 
        { 
            get { return _path; } 
            set { _path = value; } 
        }
        public string Title 
        { 
            get { return _title; } 
            set { _title = value; } 
        }
        public ProjectInfo ProjectInformation 
        { 
            get { return _info; } 
            set { _info = value; } 
        }
    }

    public class Element
    {
        public Parameter get_Parameter(BuiltInParameter bip) 
        { 
            return new Parameter(); 
        }
        public IEnumerable<Parameter> Parameters 
        { 
            get { return new List<Parameter>(); } 
        }
    }

    public class ProjectInfo : Element {}

    public enum BuiltInParameter { PROJECT_STATUS, PROJECT_ISSUE_DATE }

    public class Parameter
    {
        private Definition _def = new Definition();
        public bool IsReadOnly { get { return false; } }
        public void Set(string value) {}
        public Definition Definition 
        { 
            get { return _def; } 
            set { _def = value; } 
        }
    }

    public class Definition
    {
        private string _name = "";
        public string Name 
        { 
            get { return _name; } 
            set { _name = value; } 
        }
    }

    public class Transaction : IDisposable
    {
        public Transaction(Document doc, string name) {}
        public void Start() {}
        public void Commit() {}
        public void Dispose() {}
    }

    public class ControlledApplication
    {
        public event EventHandler<Events.DocumentOpeningEventArgs> DocumentOpening;
        public event EventHandler<Events.DocumentSavedEventArgs> DocumentSaved;
        public event EventHandler<Events.DocumentClosedEventArgs> DocumentClosed;
        public event EventHandler<Events.DocumentSynchronizingWithCentralEventArgs> DocumentSynchronizingWithCentral;
        public event EventHandler<Events.FamilyLoadingIntoDocumentEventArgs> FamilyLoadingIntoDocument;

        public void TriggerOpening(Events.DocumentOpeningEventArgs e) 
        { 
            if (DocumentOpening != null) DocumentOpening(this, e); 
        }
        public void TriggerSaved(Events.DocumentSavedEventArgs e) 
        { 
            if (DocumentSaved != null) DocumentSaved(this, e); 
        }
        public void TriggerClosed(Events.DocumentClosedEventArgs e) 
        { 
            if (DocumentClosed != null) DocumentClosed(this, e); 
        }
        public void TriggerSynchronizing(Events.DocumentSynchronizingWithCentralEventArgs e) 
        { 
            if (DocumentSynchronizingWithCentral != null) DocumentSynchronizingWithCentral(this, e); 
        }
        public void TriggerFamilyLoading(Events.FamilyLoadingIntoDocumentEventArgs e) 
        { 
            if (FamilyLoadingIntoDocument != null) FamilyLoadingIntoDocument(this, e); 
        }
    }

    public class ElementId
    {
        private int _id;
        public int IntegerValue { get { return _id; } set { _id = value; } }
        public long Value { get { return _id; } }
        public ElementId(int id) { _id = id; }
    }

    public enum ChangePriority { MEPFixtures, Annotations, DoorsOpenings }

    public class AddInId
    {
        public AddInId(Guid guid) {}
    }

    public class UpdaterId
    {
        public UpdaterId(AddInId id, Guid guid) {}
    }

    public interface IUpdater
    {
        void Execute(UpdaterData data);
        string GetAdditionalInformation();
        ChangePriority GetChangePriority();
        UpdaterId GetUpdaterId();
        string GetUpdaterName();
    }

    public class UpdaterData
    {
        public Document GetDocument() { return new Document(); }
        public ICollection<ElementId> GetModifiedElementIds() { return new List<ElementId>(); }
    }

    public class XYZ
    {
        public double X, Y, Z;
        public static XYZ BasisZ { get { return new XYZ(0, 0, 1); } }
        public XYZ(double x, double y, double z) { X = x; Y = y; Z = z; }
        public static XYZ operator +(XYZ a, XYZ b) { return new XYZ(a.X + b.X, a.Y + b.Y, a.Z + b.Z); }
        public static XYZ operator -(XYZ a, XYZ b) { return new XYZ(a.X - b.X, a.Y - b.Y, a.Z - b.Z); }
        public XYZ Normalize() { return this; }
    }
}

namespace Autodesk.Revit.DB.Events
{
    public class DocumentOpeningEventArgs : EventArgs
    {
        private string _path = "";
        private bool _cancelled = false;
        public string PathName { get { return _path; } set { _path = value; } }
        public bool IsCancelled { get { return _cancelled; } }
        public void Cancel() { _cancelled = true; }
    }

    public class DocumentSavedEventArgs : EventArgs
    {
        private Autodesk.Revit.DB.Document _doc = new Autodesk.Revit.DB.Document();
        public Autodesk.Revit.DB.Document Document { get { return _doc; } set { _doc = value; } }
    }

    public class DocumentClosedEventArgs : EventArgs
    {
        private Autodesk.Revit.DB.Document _doc = new Autodesk.Revit.DB.Document();
        public Autodesk.Revit.DB.Document Document { get { return _doc; } set { _doc = value; } }
    }

    public class DocumentSynchronizingWithCentralEventArgs : EventArgs
    {
        private Autodesk.Revit.DB.Document _doc = new Autodesk.Revit.DB.Document();
        private bool _cancelled = false;
        public Autodesk.Revit.DB.Document Document { get { return _doc; } set { _doc = value; } }
        public bool IsCancelled { get { return _cancelled; } }
        public void Cancel() { _cancelled = true; }
    }

    public class FamilyLoadingIntoDocumentEventArgs : EventArgs
    {
        private string _path = "";
        private bool _cancelled = false;
        public string FamilyPath { get { return _path; } set { _path = value; } }
        public bool IsCancelled { get { return _cancelled; } }
        public void Cancel() { _cancelled = true; }
    }
}
