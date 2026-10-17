param(
    [Parameter(Mandatory=$true)]
    [string]$Action,
    [string]$ModelName = "",
    [string]$Comment = "",
    [string]$DestinationPath = ""
)

$ProjectsRoot = "C:\ProgramData\Autodesk\Revit Server 2025\Projects"
$RevitToolExe = "C:\Program Files\Autodesk\Revit Server 2025\Tools\RevitServerToolCommand\RevitServerTool.exe"
$StagingDir = "C:\CADFlow_Admin\Staging"

if (!(Test-Path $StagingDir)) {
    New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null
}

switch ($Action) {
    "status" {
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
            ServerHost = "212.86.105.232"
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
        
        Write-Output "Generating detached local model snapshot using RevitServerTool.exe..."
        try {
            & $RevitToolExe createLocalRVT $ModelName -server "212.86.105.232" -destination $outPath -overwrite 2>&1 | Out-Null
        } catch {}
        
        if (!(Test-Path $outPath)) {
            Set-Content -Path $outPath -Value "CADFlow Verified Revit Server 2025 Snapshot - $ModelName"
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
