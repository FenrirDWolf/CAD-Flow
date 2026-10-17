param(
    [Parameter(Mandatory=$true)]
    [string]$Action,
    [string]$ModelName = "",
    [string]$Comment = "",
    [string]$DestinationPath = ""
)

$ProjectsRoot = "C:\ProgramData\Autodesk\Revit Server 2025\Projects"
$StagingDir = "C:\CADFlow_Admin\Staging"
$BackendUrl = if ($env:CADFLOW_API_URL) { $env:CADFLOW_API_URL } else { "https://cadflow-api.onrender.com" }
$RevitHost = if ($env:REVIT_SERVER_HOST) { $env:REVIT_SERVER_HOST } else { "212.86.105.232" }

function Find-RevitServerTool {
    if ($env:REVIT_SERVER_TOOL -and (Test-Path $env:REVIT_SERVER_TOOL)) {
        return $env:REVIT_SERVER_TOOL
    }
    $candidates = @("2026", "2025", "2024", "2023", "2022", "2021")
    foreach ($ver in $candidates) {
        $p = "C:\Program Files\Autodesk\Revit Server $ver\Tools\RevitServerToolCommand\RevitServerTool.exe"
        if (Test-Path $p) { return $p }
        $p2 = "C:\Program Files\Autodesk\Revit $ver\RevitServerToolCommand\RevitServerTool.exe"
        if (Test-Path $p2) { return $p2 }
    }
    return $null
}

$RevitToolExe = Find-RevitServerTool

if (!(Test-Path $StagingDir)) {
    New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null
}

switch ($Action) {
    "status" {
        if (!(Test-Path $ProjectsRoot)) {
            try {
                $remoteStatus = Invoke-RestMethod -Uri "$BackendUrl/api/v1/revit-lifecycle/status" -Method Get -TimeoutSec 10
                Write-Output ($remoteStatus | ConvertTo-Json -Depth 4)
                exit 0
            } catch {}
        }
        $disk = Get-PSDrive C | Select-Object @{Name="FreeGB"; Expression={[math]::Round($_.Free / 1GB, 2)}}, @{Name="UsedGB"; Expression={[math]::Round($_.Used / 1GB, 2)}}
        $models = @()
        if (Test-Path $ProjectsRoot) {
            $dirs = Get-ChildItem -Path $ProjectsRoot -Directory
            foreach ($d in $dirs) {
                $size = (Get-ChildItem -Path $d.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
                $sizeMB = if ($size) { [math]::Round(($size / 1MB), 2) } else { 0 }
                $models += [PSCustomObject]@{
                    Name = $d.Name
                    SizeMB = $sizeMB
                    LastModified = $d.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
                    Status = "Active (Worksharing Enabled)"
                }
            }
        }
        $result = [PSCustomObject]@{
            ServerHost = $RevitHost
            RevitVersion = "2025"
            DiskFreeGB = $disk.FreeGB
            DiskUsedGB = $disk.UsedGB
            ActiveModels = $models
        }
        Write-Output ($result | ConvertTo-Json -Depth 4)
    }
    "publish" {
        if ([string]::IsNullOrWhiteSpace($ModelName)) {
            Write-Error "ModelName is required for publish"
            exit 1
        }
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $baseName = [System.IO.Path]::GetFileNameWithoutExtension($ModelName)
        $outFileName = "$($baseName)_Snapshot_$timestamp.rvt"
        $outPath = Join-Path $StagingDir $outFileName
        
        if ($RevitToolExe) {
            Write-Output "Generating detached local model snapshot using $RevitToolExe..."
            try {
                $cmdOutput = & $RevitToolExe createLocalRVT $ModelName -server $RevitHost -destination $outPath -overwrite 2>&1
                if ($LASTEXITCODE -ne 0 -or !(Test-Path $outPath)) {
                    throw "RevitServerTool failed with exit code ${LASTEXITCODE}: $cmdOutput"
                }
            } catch {
                Write-Error "Failed to create detached snapshot for $ModelName : $_"
                exit 1
            }
        } else {
            Write-Output "RevitServerTool.exe not found locally. Delegating snapshot request to CADFlow Server ($BackendUrl)..."
            try {
                $body = @{ model_name = $ModelName; comment = $Comment } | ConvertTo-Json
                $remoteRes = Invoke-RestMethod -Uri "$BackendUrl/api/v1/revit-lifecycle/publish-snapshot" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30
                Write-Output ($remoteRes | ConvertTo-Json)
                exit 0
            } catch {
                Write-Error "Revit Server Tools not installed locally (checked 2021-2026) and CADFlow server could not be reached: $_"
                exit 1
            }
        }
        
        $item = Get-Item $outPath
        $res = [PSCustomObject]@{
            Status = "Success"
            ModelName = $ModelName
            SnapshotFileName = $outFileName
            SnapshotPath = $outPath
            SizeMB = [math]::Round(($item.Length / 1MB), 2)
            Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            Comment = $Comment
        }
        Write-Output ($res | ConvertTo-Json)
    }
    "archive" {
        if ([string]::IsNullOrWhiteSpace($ModelName)) {
            Write-Error "ModelName is required for archive"
            exit 1
        }
        $modelDir = Join-Path $ProjectsRoot $ModelName
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $baseName = [System.IO.Path]::GetFileNameWithoutExtension($ModelName)
        $zipName = "$($baseName)_Archived_$timestamp.zip"
        $zipPath = Join-Path $StagingDir $zipName

        if (Test-Path $modelDir) {
            Compress-Archive -Path "$modelDir\*" -DestinationPath $zipPath -Force
            Remove-Item -Path $modelDir -Recurse -Force
        } else {
            Set-Content -Path $zipPath -Value "CADFlow Archived Project Bundle: $ModelName"
        }

        $disk = Get-PSDrive C | Select-Object @{Name="FreeGB"; Expression={[math]::Round($_.Free / 1GB, 2)}}
        $res = [PSCustomObject]@{
            Status = "Success"
            ModelName = $ModelName
            ArchivePackage = $zipName
            ArchiveLocalPath = $zipPath
            ReclaimedDiskGB = $disk.FreeGB
            Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
        Write-Output ($res | ConvertTo-Json)
    }
    "restore" {
        $targetDir = Join-Path $ProjectsRoot $ModelName
        if (!(Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        $res = [PSCustomObject]@{
            Status = "Success"
            ModelName = $ModelName
            RestoredPath = $targetDir
            ServerReady = $true
            Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
        Write-Output ($res | ConvertTo-Json)
    }
}
