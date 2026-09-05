// FireflyAdminApp.exe：Firefly 管理后台的原生窗口壳。
// - 无边框自绘标题栏（深浅色跟随应用设置）
// - WebView2 渲染管理后台页面（Win10/11 自带运行时）
// - 自动隐藏启动 FireflyAdmin.exe 服务引擎；按 data/settings.json 的
//   closeAction 决定关窗口时是否结束引擎（exit 结束 / background 保留）
// 语法限制：由 .NET Framework 自带 csc（C# 5）编译，勿用新语法。
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FireflyAdminWindow
{
    public class AppSettingsInfo
    {
        public PrefsInfo preferences = new PrefsInfo();
    }

    public class PrefsInfo
    {
        public string closeAction = "exit";
        public int port = 5175;
        public string colorMode = "light";
    }

    public class MainForm : Form
    {
        readonly WebView2 web = new WebView2();
        readonly Panel titleBar = new Panel();
        readonly Label titleLabel = new Label();
        Process serverProcess;
        bool serverOwned;
        string url;
        string baseDir;
        PrefsInfo prefs = new PrefsInfo();
        bool closing;
        int titleLeft = 14;

        [DllImport("user32.dll")]
        static extern bool ReleaseCapture();
        [DllImport("user32.dll")]
        static extern int SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

        public MainForm()
        {
            baseDir = AppDomain.CurrentDomain.BaseDirectory;
            prefs = ReadPrefs();
            url = "http://127.0.0.1:" + prefs.port;

            Text = "FireFly管理后台";
            ClientSize = new Size(1440, 900);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.None;
            MinimumSize = new Size(900, 600);
            bool dark = prefs.colorMode == "dark";
            BackColor = dark ? Color.FromArgb(20, 20, 22) : Color.FromArgb(245, 247, 250);

            // 任务栏/标题栏图标：沿用服务引擎 FireflyAdmin.exe（node.exe）的默认图标
            try
            {
                string serverExe = Path.Combine(baseDir, "FireflyAdmin.exe");
                if (File.Exists(serverExe))
                {
                    Icon appIcon = Icon.ExtractAssociatedIcon(serverExe);
                    if (appIcon != null)
                    {
                        Icon = appIcon;
                        var iconBox = new PictureBox();
                        iconBox.Size = new Size(20, 20);
                        iconBox.Location = new Point(14, 10);
                        iconBox.SizeMode = PictureBoxSizeMode.StretchImage;
                        iconBox.Image = appIcon.ToBitmap();
                        titleBar.Controls.Add(iconBox);
                        titleLeft = 40;
                    }
                }
            }
            catch { }

            titleBar.Dock = DockStyle.Top;
            titleBar.Height = 40;
            titleBar.BackColor = dark ? Color.FromArgb(28, 28, 32) : Color.White;
            titleBar.MouseDown += DragWindow;

            titleLabel.Text = "FireFly管理后台";
            titleLabel.ForeColor = dark ? Color.White : Color.FromArgb(48, 49, 51);
            titleLabel.Font = new Font("Microsoft YaHei UI", 9.5f, FontStyle.Bold);
            titleLabel.AutoSize = true;
            titleLabel.Location = new Point(titleLeft, 10);
            titleLabel.MouseDown += DragWindow;
            titleBar.Controls.Add(titleLabel);

            titleBar.Controls.Add(MakeTitleButton("—", dark, MinimizeClick, false));
            titleBar.Controls.Add(MakeTitleButton("✕", dark, CloseClick, true));

            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = dark ? Color.FromArgb(20, 20, 22) : Color.White;
            Controls.Add(web);
            Controls.Add(titleBar);
            titleBar.Height = 40;

            Load += OnLoad;
            FormClosing += OnFormClosing;
            Resize += delegate { if (titleLabel != null) titleLabel.Location = new Point(titleLeft, (titleBar.Height - titleLabel.Height) / 2); };
        }

        Button MakeTitleButton(string text, bool dark, EventHandler onClick, bool danger)
        {
            var b = new Button();
            b.Text = text;
            b.Size = new Size(46, 40);
            b.Dock = DockStyle.Right;
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.BackColor = titleBar.BackColor;
            b.ForeColor = dark ? Color.White : Color.FromArgb(48, 49, 51);
            b.Font = new Font("Segoe UI Symbol", 10f);
            b.TabStop = false;
            b.MouseEnter += delegate { b.BackColor = danger ? Color.FromArgb(196, 43, 28) : (dark ? Color.FromArgb(60, 60, 66) : Color.FromArgb(229, 229, 229)); };
            b.MouseLeave += delegate { b.BackColor = titleBar.BackColor; };
            b.Click += onClick;
            return b;
        }

        void MinimizeClick(object sender, EventArgs e)
        {
            WindowState = FormWindowState.Minimized;
        }

        void CloseClick(object sender, EventArgs e)
        {
            Close();
        }

        void DragWindow(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                ReleaseCapture();
                SendMessage(Handle, 0xA1, 0x2, 0);
            }
        }

        async void OnLoad(object sender, EventArgs e)
        {
            await Task.Run(new Action(EnsureServerRunning));
            try
            {
                var env = await CoreWebView2Environment.CreateAsync(null,
                    Path.Combine(baseDir, "data", "webview2"));
                await web.EnsureCoreWebView2Async(env);
                web.CoreWebView2.DocumentTitleChanged += delegate
                {
                    Text = web.CoreWebView2.DocumentTitle;
                    titleLabel.Text = Text;
                };
                web.SourceChanged += delegate { Text = "FireFly管理后台"; };
                web.CoreWebView2.Navigate(url);
            }
            catch (Exception ex)
            {
                MessageBox.Show("WebView2 初始化失败：" + ex.Message +
                    "\n\nWebView2 运行时一般随 Windows 10/11 自带；请安装「WebView2 Runtime」后重试。" +
                    "\n本次将回退到默认浏览器打开。", "Firefly 管理后台");
                OpenInDefaultBrowser(url);
                Close();
            }
        }

        void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            if (closing) return;
            closing = true;
            // closeAction = exit：关闭窗口同时结束服务引擎；background：引擎保留后台
            if (prefs.closeAction != "background" && serverOwned && serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    serverProcess.Kill();
                }
                catch { }
            }
        }

        void EnsureServerRunning()
        {
            if (PingServer()) return;
            var exe = Path.Combine(baseDir, "FireflyAdmin.exe");
            if (!File.Exists(exe)) return;
            var psi = new ProcessStartInfo();
            psi.FileName = exe;
            psi.WorkingDirectory = baseDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.EnvironmentVariables["NO_OPEN"] = "1";
            try
            {
                serverProcess = Process.Start(psi);
                serverOwned = true;
            }
            catch { }
            for (int i = 0; i < 60; i++)
            {
                if (PingServer()) return;
                System.Threading.Thread.Sleep(200);
            }
        }

        bool PingServer()
        {
            try
            {
                var rq = (HttpWebRequest)WebRequest.Create(url + "/api/health");
                rq.Timeout = 500;
                rq.ReadWriteTimeout = 500;
                using (var rs = rq.GetResponse()) { }
                return true;
            }
            catch
            {
                return false;
            }
        }

        void OpenInDefaultBrowser(string target)
        {
            try
            {
                Process.Start(target);
            }
            catch { }
        }

        PrefsInfo ReadPrefs()
        {
            var result = new PrefsInfo();
            try
            {
                var json = File.ReadAllText(Path.Combine(baseDir, "data", "settings.json"));
                var ser = new JavaScriptSerializer();
                var settings = ser.Deserialize<AppSettingsInfo>(json);
                if (settings != null && settings.preferences != null)
                {
                    if (!string.IsNullOrEmpty(settings.preferences.closeAction)) result.closeAction = settings.preferences.closeAction;
                    if (settings.preferences.port > 0) result.port = settings.preferences.port;
                    if (!string.IsNullOrEmpty(settings.preferences.colorMode)) result.colorMode = settings.preferences.colorMode;
                }
            }
            catch { }
            return result;
        }

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
