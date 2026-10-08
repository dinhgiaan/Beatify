param(
    [string]$InitialPath = ""
)

Add-Type -AssemblyName System.Windows.Forms

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Chọn thư mục cho Beatify"
$dialog.ShowNewFolderButton = $true

if ($InitialPath -and (Test-Path $InitialPath)) {
    $dialog.SelectedPath = $InitialPath
}

# Tạo cửa sổ owner TopMost để dialog hiển thị ngay trên cùng màn hình
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized

$result = $dialog.ShowDialog($form)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}

$form.Dispose()
$dialog.Dispose()
