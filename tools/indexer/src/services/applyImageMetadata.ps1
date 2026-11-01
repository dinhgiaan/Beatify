param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    [Parameter(Mandatory=$true)]
    [string]$ArtistName,
    [string]$Curator = "Kato"
)

Add-Type -AssemblyName PresentationCore, WindowsBase

try {
    if (-not (Test-Path $FilePath)) {
        Write-Error "File khong ton tai: $FilePath"
        exit 1
    }

    $fullPath = (Resolve-Path $FilePath).Path
    $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
    $tempFile = $fullPath + ".meta_tmp" + $ext

    $fileStream = [System.IO.File]::OpenRead($fullPath)
    $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
        $fileStream,
        [System.Windows.Media.Imaging.BitmapCreateOptions]::None,
        [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
    )
    $frame = $decoder.Frames[0]

    $title = "Official Artist Artwork - $ArtistName"
    $subject = "Beatify High-Resolution Artist Profile & Cover Asset"
    $comment = "Curated, verified, and enhanced by $Curator for the Beatify Music Library. Premium lossless profile artwork."
    $copyright = "Curated by $Curator (C) Beatify Music Ecosystem. All rights reserved."
    $software = "Beatify Music Studio (Curated by $Curator)"
    $rating = 99 # 5 sao (Windows Rating)

    $metadata = $null

    if ($ext -eq ".jpg" -or $ext -eq ".jpeg") {
        if ($frame.Metadata) {
            $metadata = $frame.Metadata.Clone() -as [System.Windows.Media.Imaging.BitmapMetadata]
        }
        if (-not $metadata) {
            $metadata = New-Object System.Windows.Media.Imaging.BitmapMetadata("jpg")
        }

        # Thuoc tinh cap cao cua Windows Shell / WIC
        $metadata.Title = $title
        $metadata.Subject = $subject
        $metadata.Comment = $comment
        $metadata.Copyright = $copyright
        $metadata.ApplicationName = $software
        $metadata.Rating = $rating

        # Tac gia (Authors)
        $authorList = New-Object 'System.Collections.Generic.List[string]'
        $authorList.Add($Curator)
        $metadata.Author = New-Object 'System.Collections.ObjectModel.ReadOnlyCollection[string]' (,$authorList)

        # Tu khoa / Tags
        $kwList = New-Object 'System.Collections.Generic.List[string]'
        $kwList.Add("Beatify")
        $kwList.Add($Curator)
        $kwList.Add("Music")
        $kwList.Add("Artist")
        $kwList.Add("Profile")
        $kwList.Add("Verified")
        $kwList.Add($ArtistName)
        $metadata.Keywords = New-Object 'System.Collections.ObjectModel.ReadOnlyCollection[string]' (,$kwList)

        # Ghi them cac the EXIF tieu chuan
        try { $metadata.SetQuery("/app1/ifd/{ushort=315}", $Curator) } catch {}
        try { $metadata.SetQuery("/app1/ifd/{ushort=33432}", $copyright) } catch {}
        try { $metadata.SetQuery("/app1/ifd/{ushort=270}", $title) } catch {}
        try { $metadata.SetQuery("/app1/ifd/{ushort=305}", $software) } catch {}

        $encoder = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
        $encoder.QualityLevel = 98

    } elseif ($ext -eq ".png") {
        if ($frame.Metadata) {
            $metadata = $frame.Metadata.Clone() -as [System.Windows.Media.Imaging.BitmapMetadata]
        }
        if (-not $metadata) {
            $metadata = New-Object System.Windows.Media.Imaging.BitmapMetadata("png")
        }

        # Ghi chuoi thong tin vao cac text chunk PNG (tEXt)
        try { $metadata.SetQuery("/tEXt/{str=Author}", $Curator) } catch {}
        try { $metadata.SetQuery("/tEXt/{str=Artist}", $Curator) } catch {}
        try { $metadata.SetQuery("/tEXt/{str=Title}", $title) } catch {}
        try { $metadata.SetQuery("/tEXt/{str=Description}", $comment) } catch {}
        try { $metadata.SetQuery("/tEXt/{str=Comment}", $comment) } catch {}
        try { $metadata.SetQuery("/tEXt/{str=Copyright}", $copyright) } catch {}
        try { $metadata.SetQuery("/tEXt/{str=Software}", $software) } catch {}
        try { $metadata.SetQuery("/tEXt/{str=Source}", "Beatify Music Library") } catch {}

        $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    } else {
        $fileStream.Close()
        Write-Output "SKIP_UNSUPPORTED_FORMAT"
        exit 0
    }

    $outStream = [System.IO.File]::OpenWrite($tempFile)
    $newFrame = [System.Windows.Media.Imaging.BitmapFrame]::Create(
        $frame,
        $frame.Thumbnail,
        $metadata,
        $frame.ColorContexts
    )
    $encoder.Frames.Add($newFrame)
    $encoder.Save($outStream)

    $outStream.Close()
    $fileStream.Close()

    Move-Item -Force $tempFile $fullPath
    Write-Output "SUCCESS"
} catch {
    if ($fileStream) { $fileStream.Close() }
    if ($outStream) { $outStream.Close() }
    if (Test-Path $tempFile) { Remove-Item -Force $tempFile }
    Write-Error $_.Exception.Message
    exit 1
}
