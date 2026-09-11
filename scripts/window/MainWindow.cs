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
using System.Security.Cryptography;
using System.Text;
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

    public class HealthInfo
    {
        public bool ok;
        public string id;
    }

    public class RuntimeInfo
    {
        public int port;
        public int pid;
        public string id;
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
        string instanceId;
        PrefsInfo prefs = new PrefsInfo();
        bool closing;
        int titleLeft = 14;

        [DllImport("user32.dll")]
        static extern bool ReleaseCapture();
        [DllImport("user32.dll")]
        static extern int SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

        public MainForm()
        {
            baseDir = Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
            instanceId = InstanceId(baseDir);
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
            // 只认「本目录实例」：health 返回的实例 id 必须与 EXE 所在目录一致，
            // 避免默认端口被开发模式服务或其他目录的实例占用时误连、读到别人的配置
            if (PingServer()) return;
            int rt = ReadRuntimePort();
            if (rt > 0)
            {
                string candidate = "http://127.0.0.1:" + rt;
                if (HealthMatches(candidate))
                {
                    url = candidate;
                    return;
                }
            }
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
                // 引擎可能因默认端口被其他程序占用而自动改换了端口（见 data/server.json）
                int p = ReadRuntimePort();
                if (p > 0)
                {
                    string candidate = "http://127.0.0.1:" + p;
                    if (HealthMatches(candidate))
                    {
                        url = candidate;
                        return;
                    }
                }
                System.Threading.Thread.Sleep(200);
            }
        }

        bool PingServer()
        {
            return HealthMatches(url);
        }

        /// 访问 addr 的 /api/health，且实例 id 必须与本目录一致才算命中
        bool HealthMatches(string addr)
        {
            try
            {
                var rq = (HttpWebRequest)WebRequest.Create(addr + "/api/health");
                rq.Timeout = 500;
                rq.ReadWriteTimeout = 500;
                using (var rs = rq.GetResponse())
                using (var stream = rs.GetResponseStream())
                using (var reader = new StreamReader(stream))
                {
                    var info = new JavaScriptSerializer().Deserialize<HealthInfo>(reader.ReadToEnd());
                    return info != null && info.id == instanceId;
                }
            }
            catch
            {
                return false;
            }
        }

        /// 引擎实际监听端口（默认端口被占用自动改换时写入 data/server.json）
        int ReadRuntimePort()
        {
            try
            {
                string json = File.ReadAllText(Path.Combine(baseDir, "data", "server.json"));
                var rt = new JavaScriptSerializer().Deserialize<RuntimeInfo>(json);
                if (rt != null && rt.port > 0 && rt.id == instanceId) return rt.port;
            }
            catch { }
            return 0;
        }

        /// 实例标识：EXE 所在目录的 SHA1（与服务端 /api/health 返回的 id 对应）
        string InstanceId(string dir)
        {
            string clean = Path.GetFullPath(dir).TrimEnd('\\', '/').ToLowerInvariant();
            using (var sha = new SHA1Managed())
            {
                byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(clean));
                var sb = new StringBuilder(bytes.Length * 2);
                foreach (byte b in bytes) sb.Append(b.ToString("x2"));
                return sb.ToString();
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
