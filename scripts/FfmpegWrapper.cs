using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

class Program {
    [StructLayout(LayoutKind.Sequential)]
    struct IO_COUNTERS {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryLimit;
        public UIntPtr PeakJobMemoryLimit;
    }

    const int JobObjectExtendedLimitInformation = 9;
    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    static string EscapeArg(string arg) {
        if (string.IsNullOrEmpty(arg)) return "\"\"";
        if (arg.IndexOfAny(new char[] { ' ', '\t', '\n', '\v', '\"' }) == -1) {
            return arg;
        }
        StringBuilder sb = new StringBuilder();
        sb.Append('"');
        for (int i = 0; i < arg.Length; i++) {
            int backslashes = 0;
            while (i < arg.Length && arg[i] == '\\') {
                backslashes++;
                i++;
            }
            if (i == arg.Length) {
                sb.Append('\\', backslashes * 2);
                break;
            } else if (arg[i] == '"') {
                sb.Append('\\', backslashes * 2 + 1);
                sb.Append('"');
            } else {
                sb.Append('\\', backslashes);
                sb.Append(arg[i]);
            }
        }
        sb.Append('"');
        return sb.ToString();
    }

    static int Main(string[] args) {
        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string realFfmpeg = Path.Combine(appDir, "ffmpeg-real.exe");
        if (!File.Exists(realFfmpeg)) {
            realFfmpeg = Path.Combine(appDir, "ffmpeg-bin.exe");
        }
        if (!File.Exists(realFfmpeg)) {
            string candidate = Path.Combine(Directory.GetCurrentDirectory(), "bin", "ffmpeg-real.exe");
            if (File.Exists(candidate)) realFfmpeg = candidate;
        }

        bool hasMap = false;
        for (int k = 0; k < args.Length; k++) {
            if (args[k] == "-map") {
                hasMap = true;
                break;
            }
        }

        List<string> newArgs = new List<string>();
        for (int i = 0; i < args.Length; i++) {
            string arg = args[i];
            if ((arg == "-filter_script:a" || arg == "-filter_script" || arg.StartsWith("-filter_script:")) && i + 1 < args.Length) {
                string filterFile = args[i + 1];
                i++;
                try {
                    if (File.Exists(filterFile)) {
                        string filterContent = File.ReadAllText(filterFile).Trim();
                        newArgs.Add("-filter_complex");
                        newArgs.Add(filterContent);
                        if (!hasMap && filterContent.Contains("[a0]")) {
                            newArgs.Add("-map");
                            newArgs.Add("[a0]");
                            hasMap = true;
                        }
                    } else {
                        newArgs.Add(arg);
                        newArgs.Add(filterFile);
                    }
                } catch {
                    newArgs.Add(arg);
                    newArgs.Add(filterFile);
                }
            } else if (arg == "-filter_complex_script" && i + 1 < args.Length) {
                string filterFile = args[i + 1];
                i++;
                try {
                    if (File.Exists(filterFile)) {
                        string filterContent = File.ReadAllText(filterFile).Trim();
                        newArgs.Add("-filter_complex");
                        newArgs.Add(filterContent);
                    } else {
                        newArgs.Add(arg);
                        newArgs.Add(filterFile);
                    }
                } catch {
                    newArgs.Add(arg);
                    newArgs.Add(filterFile);
                }
            } else if (arg == "libfdk_aac") {
                newArgs.Add("aac");
            } else {
                newArgs.Add(arg);
            }
        }

        StringBuilder cmdArgs = new StringBuilder();
        for (int i = 0; i < newArgs.Count; i++) {
            if (i > 0) cmdArgs.Append(' ');
            cmdArgs.Append(EscapeArg(newArgs[i]));
        }

        ProcessStartInfo psi = new ProcessStartInfo(realFfmpeg, cmdArgs.ToString());
        psi.UseShellExecute = false;

        IntPtr job = IntPtr.Zero;
        try {
            job = CreateJobObject(IntPtr.Zero, null);
            if (job != IntPtr.Zero) {
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr infoPtr = Marshal.AllocHGlobal(length);
                try {
                    Marshal.StructureToPtr(info, infoPtr, false);
                    SetInformationJobObject(job, JobObjectExtendedLimitInformation, infoPtr, (uint)length);
                } finally {
                    Marshal.FreeHGlobal(infoPtr);
                }
            }
        } catch {
        }

        try {
            using (Process proc = Process.Start(psi)) {
                if (job != IntPtr.Zero && proc != null) {
                    try {
                        AssignProcessToJobObject(job, proc.Handle);
                    } catch {
                    }
                }
                proc.WaitForExit();
                return proc.ExitCode;
            }
        } catch (Exception ex) {
            Console.Error.WriteLine("[ffmpeg-wrapper] Failed to execute " + realFfmpeg + ": " + ex.Message);
            return 1;
        } finally {
            if (job != IntPtr.Zero) {
                CloseHandle(job);
            }
        }
    }
}
