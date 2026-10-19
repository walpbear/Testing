# DeskFur's portable Windows launcher. Windows PowerShell 5.1; no administrator
# rights, npm, Node.js installation, or execution-policy changes are required.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ElectronVersion = '44.9.0'
$ExpectedSha256 = '88e08039d0ef359bab9f674e8051fa103bd8628ea7c5a5e1daaa610a8a0c6931'
$DownloadUrl = 'https://github.com/electron/electron/releases/download/v44.9.0/electron-v44.9.0-win32-x64.zip'
$InstallRoot = $null
$InstallLock = $null
$StagingDirectory = $null
$DownloadFile = $null
$TemporaryApp = $null
$BackupDirectory = $null
$CanRemoveBackup = $false

function Test-DeskFurRuntime {
    param([Parameter(Mandatory = $true)][string]$Directory)
    $Executable = Join-Path $Directory 'DeskFur.exe'
    $Resources = Join-Path $Directory 'resources'
    $Receipt = Join-Path $Directory 'deskfur-runtime.sha256'
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath $Resources -PathType Container)) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $Directory 'LICENSE') -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $Directory 'LICENSES.chromium.html') -PathType Leaf)) { return $false }
    if (-not (Test-Path -LiteralPath $Receipt -PathType Leaf)) { return $false }
    return ((Get-Content -LiteralPath $Receipt -Raw).Trim() -eq $ExpectedSha256)
}

try {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw 'This download needs 64-bit Windows 10 or newer.'
    }
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        throw 'Windows did not provide LOCALAPPDATA. Run this launcher from your normal Windows user account.'
    }
    $SourceApp = Join-Path $PSScriptRoot 'app.asar'
    if (-not (Test-Path -LiteralPath $SourceApp -PathType Leaf)) {
        throw 'app.asar is missing. Extract the entire DeskFur ZIP into a folder before opening Start-DeskFur.cmd. Keep start.ps1 and app.asar together.'
    }

    $InstallRoot = Join-Path $env:LOCALAPPDATA 'DeskFur'
    $RuntimeDirectory = Join-Path $InstallRoot ("runtime-" + $ElectronVersion)
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null

    # A file lock works across Windows sessions and closes automatically if the
    # launcher is interrupted. Only one launcher can install or refresh at once.
    $LockFile = Join-Path $InstallRoot 'launcher.lock'
    $WaitUntil = [DateTime]::UtcNow.AddMinutes(20)
    $PrintedWait = $false
    while ($null -eq $InstallLock) {
        try {
            $InstallLock = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        }
        catch [System.IO.IOException] {
            if ([DateTime]::UtcNow -gt $WaitUntil) {
                throw 'Another DeskFur launcher is still installing. Close the other launcher window and try again.'
            }
            if (-not $PrintedWait) {
                Write-Host 'Waiting for the other DeskFur launcher to finish...'
                $PrintedWait = $true
            }
            Start-Sleep -Milliseconds 500
        }
    }

    if (-not (Test-DeskFurRuntime -Directory $RuntimeDirectory)) {
        Write-Host 'Setting up DeskFur for the first time.'
        Write-Host 'Downloading the official Electron runtime (about 151 MiB). Please keep this window open.'
        Write-Host 'Future launches use the saved runtime and do not download it again.'
        $Identifier = [Guid]::NewGuid().ToString('N')
        $DownloadFile = Join-Path $InstallRoot ('.electron-' + $Identifier + '.zip')
        $StagingDirectory = Join-Path $InstallRoot ('.runtime-staging-' + $Identifier)

        # GitHub and its HTTPS release-asset redirects deliver the official ZIP.
        # Its complete SHA-256 is pinned before any archive content is installed.
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri $DownloadUrl -OutFile $DownloadFile -TimeoutSec 1200
        Write-Host 'Verifying the runtime download...'
        $ActualSha256 = (Get-FileHash -LiteralPath $DownloadFile -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($ActualSha256 -ne $ExpectedSha256) {
            throw 'The runtime checksum did not match the official pinned release. Nothing from this download was installed. Delete the ZIP and try again on a stable connection.'
        }

        Write-Host 'Extracting the verified runtime...'
        Expand-Archive -LiteralPath $DownloadFile -DestinationPath $StagingDirectory
        $OriginalExecutable = Join-Path $StagingDirectory 'electron.exe'
        if (-not (Test-Path -LiteralPath $OriginalExecutable -PathType Leaf)) {
            throw 'The verified runtime archive did not contain electron.exe.'
        }
        if (-not (Test-Path -LiteralPath (Join-Path $StagingDirectory 'resources') -PathType Container)) {
            throw 'The runtime resources folder is missing.'
        }
        Rename-Item -LiteralPath $OriginalExecutable -NewName 'DeskFur.exe'
        $DefaultApp = Join-Path $StagingDirectory 'resources\default_app.asar'
        if (Test-Path -LiteralPath $DefaultApp -PathType Leaf) { Remove-Item -LiteralPath $DefaultApp -Force }
        Copy-Item -LiteralPath $SourceApp -Destination (Join-Path $StagingDirectory 'resources\app.asar') -Force
        Set-Content -LiteralPath (Join-Path $StagingDirectory 'deskfur-runtime.sha256') -Value $ExpectedSha256 -Encoding ASCII
        if (-not (Test-DeskFurRuntime -Directory $StagingDirectory)) {
            throw 'The extracted runtime is incomplete. Please run the launcher again.'
        }

        # Build beside the final directory, then rename into place. Interrupted
        # downloads/extraction never leave a partially installed runtime.
        if (Test-Path -LiteralPath $RuntimeDirectory) {
            $BackupDirectory = Join-Path $InstallRoot ('.runtime-previous-' + $Identifier)
            Move-Item -LiteralPath $RuntimeDirectory -Destination $BackupDirectory
        }
        try {
            Move-Item -LiteralPath $StagingDirectory -Destination $RuntimeDirectory
            $StagingDirectory = $null
            $CanRemoveBackup = $true
        }
        catch {
            if ($null -ne $BackupDirectory -and (Test-Path -LiteralPath $BackupDirectory)) {
                Move-Item -LiteralPath $BackupDirectory -Destination $RuntimeDirectory
                $BackupDirectory = $null
            }
            throw
        }
        Write-Host 'The verified runtime is ready.'
    }

    # Refresh changed application files from this extracted download. An already
    # current app needs no replacement, including while its files are in use.
    $ResourcesDirectory = Join-Path $RuntimeDirectory 'resources'
    $DefaultApp = Join-Path $ResourcesDirectory 'default_app.asar'
    if (Test-Path -LiteralPath $DefaultApp -PathType Leaf) { Remove-Item -LiteralPath $DefaultApp -Force }
    $InstalledApp = Join-Path $ResourcesDirectory 'app.asar'
    try {
        $InstalledAppExists = Test-Path -LiteralPath $InstalledApp -PathType Leaf
        $SourceHash = (Get-FileHash -LiteralPath $SourceApp -Algorithm SHA256).Hash
        $InstalledHash = if ($InstalledAppExists) { (Get-FileHash -LiteralPath $InstalledApp -Algorithm SHA256).Hash } else { $null }
        if (-not $InstalledAppExists -or $SourceHash -ne $InstalledHash) {
            $AppIdentifier = [Guid]::NewGuid().ToString('N')
            $TemporaryApp = Join-Path $ResourcesDirectory ('.app-' + $AppIdentifier + '.asar')
            Copy-Item -LiteralPath $SourceApp -Destination $TemporaryApp -Force
            if ($InstalledAppExists) {
                # PowerShell can bind a null string argument as an empty string.
                # Use a real, unique backup path for .NET's replacement operation.
                $PreviousApp = Join-Path $ResourcesDirectory ('.app-previous-' + $AppIdentifier + '.asar')
                [System.IO.File]::Replace($TemporaryApp, $InstalledApp, $PreviousApp)
                $TemporaryApp = $null
                # Keep any recovery backup if replacement throws. Cleanup after
                # a successful replacement must not prevent the app starting.
                Remove-Item -LiteralPath $PreviousApp -Force -ErrorAction SilentlyContinue
            }
            else {
                [System.IO.File]::Move($TemporaryApp, $InstalledApp)
                $TemporaryApp = $null
            }
        }
    }
    catch {
        $RefreshException = $_.Exception
        throw [System.IO.IOException]::new(('DeskFur could not refresh its application files. Quit DeskFur from its tray menu, then open Start-DeskFur.cmd again. Details: ' + $RefreshException.Message), $RefreshException)
    }

    $Executable = Join-Path $RuntimeDirectory 'DeskFur.exe'
    Write-Host 'Starting DeskFur...'
    Start-Process -FilePath $Executable -WorkingDirectory $PSScriptRoot | Out-Null
}
catch {
    Write-Host ''
    Write-Host ('DeskFur could not start: ' + $_.Exception.Message) -ForegroundColor Red
    if ($null -ne $InstallRoot -and (Test-Path -LiteralPath $InstallRoot -PathType Container)) {
        $ErrorLog = Join-Path $InstallRoot 'launcher-error.log'
        try {
            Add-Content -LiteralPath $ErrorLog -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + [Environment]::NewLine + $_.Exception.ToString() + [Environment]::NewLine) -Encoding UTF8
            Write-Host ('Error details: ' + $ErrorLog)
        }
        catch { }
    }
    exit 1
}
finally {
    # Only this invocation's temporary files are removed. Electron and Chromium
    # LICENSE files stay in the installed runtime beside its executable.
    foreach ($TemporaryFile in @($DownloadFile, $TemporaryApp)) {
        if ($null -ne $TemporaryFile -and (Test-Path -LiteralPath $TemporaryFile)) {
            Remove-Item -LiteralPath $TemporaryFile -Force -ErrorAction SilentlyContinue
        }
    }
    $TemporaryDirectories = @($StagingDirectory)
    if ($CanRemoveBackup) { $TemporaryDirectories += $BackupDirectory }
    foreach ($TemporaryDirectory in $TemporaryDirectories) {
        if ($null -ne $TemporaryDirectory -and (Test-Path -LiteralPath $TemporaryDirectory)) {
            Remove-Item -LiteralPath $TemporaryDirectory -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    if ($null -ne $InstallLock) { $InstallLock.Dispose() }
}
exit 0
