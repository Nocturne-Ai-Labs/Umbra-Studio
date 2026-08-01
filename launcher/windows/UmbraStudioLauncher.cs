using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("Umbra Studio")]
[assembly: AssemblyDescription("Umbra Studio launcher")]
[assembly: AssemblyCompany("Nocturne AI Labs")]
[assembly: AssemblyProduct("Umbra Studio")]
[assembly: AssemblyCopyright("Copyright Nocturne AI Labs")]
[assembly: AssemblyVersion("__UMBRA_ASSEMBLY_VERSION__")]
[assembly: AssemblyFileVersion("__UMBRA_ASSEMBLY_VERSION__")]
[assembly: AssemblyInformationalVersion("__UMBRA_VERSION__")]

internal static class UmbraStudioLauncher
{
    private static string Quote(string value)
    {
        if (String.IsNullOrEmpty(value)) return "\"\"";
        var result = new StringBuilder("\"");
        var backslashes = 0;
        foreach (var character in value)
        {
            if (character == '\\')
            {
                backslashes++;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', backslashes * 2 + 1);
                result.Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            backslashes = 0;
            result.Append(character);
        }
        result.Append('\\', backslashes * 2);
        result.Append('"');
        return result.ToString();
    }

    [STAThread]
    private static int Main(string[] args)
    {
        var runtimeRoot = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        var bunPath = Path.Combine(runtimeRoot, "Runtime", "Bun", "win32", "bun.exe");
        var launcherPath = Path.Combine(runtimeRoot, "resources", "app", "launcher", "UmbraWebLauncher.ts");

        if (!File.Exists(bunPath) || !File.Exists(launcherPath))
        {
            MessageBox.Show(
                "Umbra Studio is incomplete. Re-extract the Windows package and keep its Runtime and resources folders beside UmbraStudio.exe.",
                "Umbra Studio",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return 1;
        }

        var arguments = new StringBuilder();
        arguments.Append(Quote(launcherPath));
        arguments.Append(" --root ");
        arguments.Append(Quote(runtimeRoot));
        foreach (var argument in args)
        {
            arguments.Append(' ');
            arguments.Append(Quote(argument));
        }

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = bunPath,
                Arguments = arguments.ToString(),
                WorkingDirectory = runtimeRoot,
                UseShellExecute = false,
                CreateNoWindow = false,
            };
            startInfo.EnvironmentVariables["UMBRA_ROOT"] = runtimeRoot;
            startInfo.EnvironmentVariables["UMBRA_TERMINAL_CHILD"] = "1";
            startInfo.EnvironmentVariables["UMBRA_LAUNCHER_IN_TERMINAL"] = "1";
            startInfo.EnvironmentVariables["UMBRA_PAUSE_ON_EXIT"] = "0";
            startInfo.EnvironmentVariables["UMBRA_TERMINAL_MODE"] = "visible";
            Process.Start(startInfo);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "Umbra Studio could not start.\n\n" + error.Message,
                "Umbra Studio",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return 1;
        }
    }
}
