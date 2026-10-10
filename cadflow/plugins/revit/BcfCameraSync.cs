using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.UI;
using Autodesk.Revit.DB;
using System.Text.Json;

namespace CADFlow.RevitPlugin
{
    public class BcfCameraSync
    {
        private readonly UIApplication _uiApp;
        private ClientWebSocket _webSocket;

        public BcfCameraSync(UIApplication uiApp)
        {
            _uiApp = uiApp;
        }

        public async Task ConnectToBcfServer(string wsUri)
        {
            _webSocket = new ClientWebSocket();
            try
            {
                await _webSocket.ConnectAsync(new Uri(wsUri), CancellationToken.None);
                _ = ReceiveMessages();
            }
            catch (Exception ex)
            {
                TaskDialog.Show("CADFlow BCF Error", "Failed to connect to BCF server: " + ex.Message);
            }
        }

        private async Task ReceiveMessages()
        {
            var buffer = new byte[1024 * 4];

            while (_webSocket.State == WebSocketState.Open)
            {
                var result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Text)
                {
                    string message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    ProcessBcfMessage(message);
                }
            }
        }

        private void ProcessBcfMessage(string message)
        {
            try
            {
                var bcfData = JsonSerializer.Deserialize<BcfCoordinateData>(message);

                // We must interact with the Revit API inside a valid Revit API context (ExternalEvent)
                // Assuming we have an IExternalEventHandler registered for camera updates
                CameraUpdateEvent.RaiseEvent(_uiApp, bcfData);
            }
            catch (Exception)
            {
                // Ignore parse errors for now
            }
        }
    }

    public class BcfCoordinateData
    {
        public double X { get; set; }
        public double Y { get; set; }
        public double Z { get; set; }
    }

    public static class CameraUpdateEvent
    {
        // Mocking the event handler raise
        public static void RaiseEvent(UIApplication uiApp, BcfCoordinateData data)
        {
            // Inside the actual ExternalEventHandler.Execute method:
            /*
            UIDocument uidoc = uiApp.ActiveUIDocument;
            Document doc = uidoc.Document;
            View3D view = doc.ActiveView as View3D;
            if (view != null)
            {
                XYZ targetPosition = new XYZ(data.X, data.Y, data.Z);
                
                // Adjust camera position and target
                XYZ eyePosition = targetPosition + new XYZ(10, 10, 10); // Offset for viewing
                XYZ upDirection = XYZ.BasisZ;
                XYZ forwardDirection = (targetPosition - eyePosition).Normalize();

                ViewOrientation3D orientation = new ViewOrientation3D(eyePosition, upDirection, forwardDirection);
                view.SetOrientation(orientation);
                uidoc.RefreshActiveView();
            }
            */
            Console.WriteLine($"[CADFlow] Raised ExternalEvent to move Revit Camera to {data.X}, {data.Y}, {data.Z}");
        }
    }
}
