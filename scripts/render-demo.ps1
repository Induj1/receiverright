<#
Render actual application screenshots into a narrated walkthrough; does not upload or publish.
Run with Windows PowerShell (System.Speech), ffmpeg and ffprobe installed.
Manifest: {title, voice?, rate?, targetDurationSeconds:165, shots:[{image,title,caption,narration,durationSeconds?}]}.
Relative image paths resolve from the repository root. Output video bytes should not be committed.
#>
[CmdletBinding()]
param(
    [string]$ManifestPath = '.artifacts/demo/manifest.json',
    [string]$OutputPath = 'output/video/ReceiveRight-Demo.mp4',
    [string]$FfmpegPath = 'ffmpeg',
    [string]$FfprobePath = 'ffprobe'
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
function Resolve-ProjectPath([string]$Value) {
    if ([System.IO.Path]::IsPathRooted($Value)) { return [System.IO.Path]::GetFullPath($Value) }
    return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $Value))
}
function Write-Utf8([string]$Path, [string]$Text) {
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}
function Invoke-Ffmpeg([string[]]$Arguments) {
    & $FfmpegPath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed with exit code $LASTEXITCODE." }
}
function Read-Duration([string]$Path) {
    $raw = & $FfprobePath -v error -show_entries format=duration -of 'default=noprint_wrappers=1:nokey=1' $Path
    if ($LASTEXITCODE -ne 0) { throw "ffprobe could not inspect $Path." }
    return [double]::Parse(($raw -join '').Trim(), [System.Globalization.CultureInfo]::InvariantCulture)
}
function Decimal([double]$Value) { return $Value.ToString('0.000', [System.Globalization.CultureInfo]::InvariantCulture) }
function Subtitle-Time([double]$Seconds) {
    $time = [TimeSpan]::FromMilliseconds([Math]::Round($Seconds * 1000))
    return '{0:00}:{1:00}:{2:00},{3:000}' -f [Math]::Floor($time.TotalHours), $time.Minutes, $time.Seconds, $time.Milliseconds
}
function Filter-Path([string]$Path) {
    return "'" + $Path.Replace('\', '/').Replace(':', '\:').Replace("'", "\'") + "'"
}
function Wrap-Caption([string]$Text, [int]$Width = 118) {
    $result = [System.Collections.Generic.List[string]]::new()
    $line = ''
    foreach ($word in ($Text -split '\s+')) {
        if (($line.Length + $word.Length + 1) -gt $Width -and $line.Length) {
            $result.Add($line)
            $line = $word
        } else { $line = ($line + ' ' + $word).Trim() }
    }
    if ($line.Length) { $result.Add($line) }
    if ($result.Count -gt 2) { throw 'A caption exceeds two lines; shorten it before rendering.' }
    return $result -join "`n"
}

$manifestFile = Resolve-ProjectPath $ManifestPath
$outputFile = Resolve-ProjectPath $OutputPath
$manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
$shots = @($manifest.shots)
if ($shots.Count -lt 1 -or $shots.Count -gt 12) { throw 'Provide 1-12 actual screenshots. Seven or eight is recommended for the submission.' }
$target = if ($manifest.targetDurationSeconds) { [double]$manifest.targetDurationSeconds } else { 165.0 }
if ($target -lt 3 -or $target -gt 175) { throw 'Target duration must be between 3 and 175 seconds.' }
$rate = if ($null -ne $manifest.rate) { [int]$manifest.rate } else { 0 }
if ($rate -lt -2 -or $rate -gt 3) { throw 'Choose a clear narration rate between -2 and 3.' }
if ($manifest.title -and ([string]$manifest.title).Length -gt 45) { throw 'Project title must be at most 45 characters.' }

$renderRoot = Join-Path $repoRoot ('.artifacts/demo-render-' + [System.Guid]::NewGuid().ToString('N').Substring(0, 10))
New-Item -ItemType Directory -Force -Path $renderRoot | Out-Null
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($outputFile)) | Out-Null
Add-Type -AssemblyName System.Speech
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $synth.Rate = $rate
    if ($manifest.voice) { $synth.SelectVoice([string]$manifest.voice) }
    $voiceName = $synth.Voice.Name
    $clips = [System.Collections.Generic.List[object]]::new()
    for ($index = 0; $index -lt $shots.Count; $index++) {
        $shot = $shots[$index]
        if (-not $shot.image -or -not $shot.title -or -not $shot.narration) { throw "Shot $($index + 1) needs image, title and narration." }
        if (([string]$shot.title).Length -gt 95) { throw "Shot $($index + 1) title is too long." }
        $imagePath = Resolve-ProjectPath ([string]$shot.image)
        if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) { throw "Screenshot not found: $imagePath" }
        $stem = '{0:00}' -f ($index + 1)
        $wavePath = Join-Path $renderRoot ($stem + '.wav')
        $progressId = 'receiverright-speech-' + [System.Guid]::NewGuid().ToString('N')
        $subscription = Register-ObjectEvent -InputObject $synth -EventName SpeakProgress -SourceIdentifier $progressId
        try {
            # Explicit PCM format keeps SAPI's word-event audio clock aligned with the written WAV.
            $speechFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
            $synth.SetOutputToWaveFile($wavePath, $speechFormat)
            $synth.Speak([string]$shot.narration)
            $synth.SetOutputToNull()
            $words = @(Get-Event -SourceIdentifier $progressId -ErrorAction SilentlyContinue | Sort-Object EventIdentifier | ForEach-Object {
                [PSCustomObject]@{ start=$_.SourceEventArgs.AudioPosition.TotalSeconds; position=$_.SourceEventArgs.CharacterPosition; length=$_.SourceEventArgs.CharacterCount }
            })
        } finally {
            Unregister-Event -SourceIdentifier $progressId -ErrorAction SilentlyContinue
            Get-Event -SourceIdentifier $progressId -ErrorAction SilentlyContinue | Remove-Event -ErrorAction SilentlyContinue
        }
        $speechSeconds = Read-Duration $wavePath
        $minimum = $speechSeconds + 0.8
        if ($shot.durationSeconds) { $minimum = [Math]::Max($minimum, [double]$shot.durationSeconds) }
        $clips.Add([PSCustomObject]@{ index=$index+1; stem=$stem; image=$imagePath; title=[string]$shot.title; caption=Wrap-Caption ([string]$shot.caption); narration=[string]$shot.narration; wave=$wavePath; speechSeconds=$speechSeconds; words=$words; seconds=$minimum })
        Write-Host ("Narrated shot {0}/{1}: {2:N1} seconds" -f ($index + 1), $shots.Count, $speechSeconds)
    }
} finally { $synth.Dispose() }

$minimumTotal = ($clips | Measure-Object -Property seconds -Sum).Sum
if ($minimumTotal -gt 175) { throw ("Narration plus transitions needs {0:N1}s. Shorten the narration to keep the final video below three minutes." -f $minimumTotal) }
$totalSeconds = [Math]::Max($target, $minimumTotal)
$extraPerShot = ($totalSeconds - $minimumTotal) / $clips.Count
$fontRegular = Filter-Path (Join-Path $env:WINDIR 'Fonts/segoeui.ttf')
$fontBold = Filter-Path (Join-Path $env:WINDIR 'Fonts/segoeuib.ttf')
$projectTitlePath = Join-Path $renderRoot 'project-title.txt'
$projectTitle = if ($manifest.title) { [string]$manifest.title } else { 'ReceiveRight' }
Write-Utf8 $projectTitlePath $projectTitle
$walkthroughPath = Join-Path $renderRoot 'walkthrough-label.txt'
Write-Utf8 $walkthroughPath 'Narrated screenshot walkthrough | Synthetic demo data | Computer-generated voice'
$concatLines = [System.Collections.Generic.List[string]]::new()
$transcript = [System.Collections.Generic.List[string]]::new()
$transcript.Add('ReceiveRight - narrated screenshot walkthrough')
$transcript.Add("Computer-generated narration: $voiceName. Screenshots are actual app views. Demonstration data is synthetic.")
$transcript.Add('')

foreach ($clip in $clips) {
    $clip.seconds += $extraPerShot
    $titleFile = Join-Path $renderRoot ($clip.stem + '-title.txt')
    $captionFile = Join-Path $renderRoot ($clip.stem + '-caption.txt')
    $counterFile = Join-Path $renderRoot ($clip.stem + '-counter.txt')
    Write-Utf8 $titleFile $clip.title
    Write-Utf8 $captionFile $clip.caption
    Write-Utf8 $counterFile ('{0:00} / {1:00}' -f $clip.index, $clips.Count)
    $filters = @(
        'scale=1792:764:force_original_aspect_ratio=decrease:flags=lanczos',
        'pad=1920:1080:(ow-iw)/2:145+(764-ih)/2:color=0xFBFBF5',
        'setsar=1',
        'drawbox=x=0:y=0:w=iw:h=126:color=0x1F5C48:t=fill',
        'drawbox=x=64:y=943:w=1792:h=2:color=0xDCE3D7:t=fill',
        "drawtext=fontfile=$fontBold`:textfile=$(Filter-Path $projectTitlePath):x=64:y=26:fontsize=43:fontcolor=white:expansion=none",
        "drawtext=fontfile=$fontRegular`:textfile=$(Filter-Path $walkthroughPath):x=66:y=87:fontsize=19:fontcolor=0xD9E5D4:expansion=none",
        "drawtext=fontfile=$fontRegular`:textfile=$(Filter-Path $counterFile):x=w-tw-64:y=47:fontsize=24:fontcolor=white:expansion=none",
        "drawtext=fontfile=$fontBold`:textfile=$(Filter-Path $titleFile):x=64:y=968:fontsize=31:fontcolor=0x183E34:expansion=none",
        "drawtext=fontfile=$fontRegular`:textfile=$(Filter-Path $captionFile):x=64:y=1016:fontsize=21:line_spacing=6:fontcolor=0x68756C:expansion=none"
    ) -join ','
    $clipFile = Join-Path $renderRoot ($clip.stem + '.mp4')
    Invoke-Ffmpeg @('-hide_banner','-loglevel','error','-y','-loop','1','-framerate','30','-i',$clip.image,'-i',$clip.wave,'-vf',$filters,'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','128k','-ar','48000','-ac','2','-af','apad','-t',(Decimal $clip.seconds),'-movflags','+faststart',$clipFile)
    $concatLines.Add("file '" + $clipFile.Replace('\','/').Replace("'", "'\''") + "'")
    $transcript.Add(('SHOT {0} - {1} ({2:N1}s)' -f $clip.index,$clip.title,$clip.seconds))
    $transcript.Add($clip.narration)
    $transcript.Add('')
    Write-Host ("Rendered shot {0}/{1}: {2}" -f $clip.index,$clips.Count,$clip.title)
}

$concatFile = Join-Path $renderRoot 'concat.txt'
Write-Utf8 $concatFile ($concatLines -join "`n")
Invoke-Ffmpeg @('-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',$concatFile,'-c','copy','-movflags','+faststart',$outputFile)
$actualDuration = Read-Duration $outputFile
if ($actualDuration -ge 180) { throw "Rendered duration is $actualDuration seconds; shorten the manifest before publication." }
$transcriptPath = [System.IO.Path]::ChangeExtension($outputFile, '.transcript.txt')
Write-Utf8 $transcriptPath ($transcript -join "`r`n")
$subtitlePath = [System.IO.Path]::ChangeExtension($outputFile, '.srt')
$subtitles = [System.Collections.Generic.List[string]]::new()
$timeline = 0.0
$cueNumber = 0
$lastCueEnd = 0.0
foreach ($clip in $clips) {
    if (-not $clip.words.Count) { throw 'Narration word timestamps were unavailable; subtitle generation requires Windows SpeakProgress events.' }
    $groupStart = 0
    for ($wordIndex = 0; $wordIndex -lt $clip.words.Count; $wordIndex++) {
        $startCharacter = [int]$clip.words[$groupStart].position
        $endCharacter = [int]$clip.words[$wordIndex].position + [int]$clip.words[$wordIndex].length
        while ($endCharacter -lt $clip.narration.Length -and $clip.narration[$endCharacter] -match '[.,!?;:]') { $endCharacter++ }
        $text = $clip.narration.Substring($startCharacter, $endCharacter - $startCharacter).Trim()
        $lastWord = $wordIndex -eq ($clip.words.Count - 1)
        if ($text.Length -ge 65 -or ($text.Length -ge 28 -and $text -match '[.!?]$') -or $lastWord) {
            $cueNumber++
            $start = $timeline + [double]$clip.words[$groupStart].start
            $end = if ($lastWord) { $timeline + $clip.speechSeconds } else { $timeline + [double]$clip.words[$wordIndex + 1].start }
            if ($start -lt $lastCueEnd -or $end -le $start -or $end -gt $actualDuration) { throw "Invalid subtitle clock at cue $cueNumber. Review speech timestamps before publication." }
            $lastCueEnd = $end
            $subtitles.Add([string]$cueNumber)
            $subtitles.Add((Subtitle-Time $start) + ' --> ' + (Subtitle-Time $end))
            $subtitles.Add((Wrap-Caption $text 46))
            $subtitles.Add('')
            $groupStart = $wordIndex + 1
        }
    }
    $timeline += $clip.seconds
}
Write-Utf8 $subtitlePath ($subtitles -join "`r`n")
$reportPath = [System.IO.Path]::ChangeExtension($outputFile, '.render.json')
$report = [ordered]@{
    output=$outputFile; format='Narrated walkthrough of actual screenshots, not a live screen recording';
    width=1920; height=1080; frameRate=30; durationSeconds=$actualDuration; voice=$voiceName; subtitles=$subtitlePath; subtitleCues=$cueNumber;
    syntheticData=$true; manifest=$manifestFile; renderedAt=[DateTime]::UtcNow.ToString('o');
    shots=@($clips | ForEach-Object { [ordered]@{image=$_.image; title=$_.title; durationSeconds=$_.seconds; narration=$_.narration} })
}
Write-Utf8 $reportPath ($report | ConvertTo-Json -Depth 6)
Write-Host ("Created {0} ({1:N1} seconds). Transcript: {2}" -f $outputFile,$actualDuration,$transcriptPath)
