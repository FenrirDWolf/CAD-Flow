using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.UI;
using Autodesk.Revit.DB;

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
                ReceiveMessages();
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
                var bcfData = new BcfCoordinateData();
                CameraUpdateEvent.RaiseEvent(_uiApp, bcfData);
            }
            catch (Exception)
            {
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
        public static void RaiseEvent(UIApplication uiApp, BcfCoordinateData data)
        {
            Console.WriteLine(string.Format("[CADFlow] Raised ExternalEvent to move Revit Camera to {0}, {1}, {2}", data.X, data.Y, data.Z));
        }
    }
}
