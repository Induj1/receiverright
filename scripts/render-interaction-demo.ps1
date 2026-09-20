<#
Render timestamped actual browser frames into narrated interaction footage; does not upload or publish.
Run with Windows PowerShell (System.Speech), ffmpeg and ffprobe installed.
Manifest: {title, voice?, rate?, targetDurationSeconds:170, sections:[{id,title,caption,narration,frames}]}.
Frames JSON: [{file:absolutePNGpath,atMs:number}]. Inter-frame timing is preserved at normal speed.
Relative image paths resolve from the repository root. Output video bytes should not be committed.
#>
[CmdletBinding()]
param(
    [string]$ManifestPath = '.artifacts/interaction-demo/manifest.json',
    [string]$OutputPath = 'output/video/ReceiveRight-Live-Demo.mp4',
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
$sections = @($manifest.sections)
if ($sections.Count -lt 1 -or $sections.Count -gt 12) { throw 'Provide 1-12 recorded interaction sections.' }
$target = if ($manifest.targetDurationSeconds) { [double]$manifest.targetDurationSeconds } else { 170.0 }
if ($target -lt 3 -or $target -gt 178.5) { throw 'Target duration must be between 3 and 178.5 seconds to leave encoding headroom below 179 seconds.' }
$rate = if ($null -ne $manifest.rate) { [int]$manifest.rate } else { 0 }
if ($rate -lt -2 -or $rate -gt 3) { throw 'Choose a clear narration rate between -2 and 3.' }
if ($manifest.title -and ([string]$manifest.title).Length -gt 18) { throw 'Project title must be at most 18 characters to fit the compact heading.' }

$renderRoot = Join-Path $repoRoot ('.artifacts/interaction-render-' + [System.Guid]::NewGuid().ToString('N').Substring(0, 10))
New-Item -ItemType Directory -Force -Path $renderRoot | Out-Null
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($outputFile)) | Out-Null
Add-Type -AssemblyName System.Speech
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $synth.Rate = $rate
    if ($manifest.voice) { $synth.SelectVoice([string]$manifest.voice) }
    $voiceName = $synth.Voice.Name
    $clips = [System.Collections.Generic.List[object]]::new()
    for ($index = 0; $index -lt $sections.Count; $index++) {
        $section = $sections[$index]
        if (-not $section.id -or -not $section.frames -or -not $section.title -or -not $section.narration) { throw "Section $($index + 1) needs id, frames, title and narration." }
        if (([string]$section.id) -notmatch '^[a-zA-Z0-9_-]{1,50}$') { throw "Section $($index + 1) id must use only letters, digits, underscores and hyphens." }
        if (([string]$section.title).Length -gt 95) { throw "Section $($index + 1) title is too long." }
        if (([string]$section.caption).Length -gt 175 -or ([string]$section.caption) -match '[\r\n]') { throw "Section $($index + 1) caption must be one line of at most 175 characters." }
        $framesPath = Resolve-ProjectPath ([string]$section.frames)
        if (-not (Test-Path -LiteralPath $framesPath -PathType Leaf)) { throw "Frame manifest not found: $framesPath" }
        $frameDocument = Get-Content -LiteralPath $framesPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $frames = @($frameDocument)
        if ($frames.Count -lt 2) { throw "Section $($section.id) needs at least two captured frames." }
        $validatedFrames = [System.Collections.Generic.List[object]]::new()
        $previousTime = -1.0
        foreach ($frame in $frames) {
            if (-not $frame.file -or $null -eq $frame.atMs) { throw "Every frame in $($section.id) needs file and atMs." }
            $atMs = [double]$frame.atMs
            if ([double]::IsNaN($atMs) -or [double]::IsInfinity($atMs) -or $atMs -lt 0 -or $atMs -le $previousTime) { throw "Frame timestamps in $($section.id) must be finite, nonnegative and strictly increasing." }
            if ($previousTime -ge 0 -and ($atMs - $previousTime) -lt 34) { throw "Frames in $($section.id) are less than 34ms apart. This 30fps renderer refuses to silently omit captured frames." }
            $framePath = Resolve-ProjectPath ([string]$frame.file)
            if (-not (Test-Path -LiteralPath $framePath -PathType Leaf)) { throw "Captured frame not found: $framePath" }
            if ([IO.Path]::GetExtension($framePath) -ne '.png') { throw "Captured frame must be PNG: $framePath" }
            $validatedFrames.Add([PSCustomObject]@{ file=$framePath; atMs=$atMs; sha256=(Get-FileHash -LiteralPath $framePath -Algorithm SHA256).Hash })
            $previousTime = $atMs
        }
        $sourceStartMs = [double]$validatedFrames[0].atMs
        $sourceSeconds = ([double]$validatedFrames[$validatedFrames.Count - 1].atMs - $sourceStartMs) / 1000.0
        if ($sourceSeconds -lt 0.05) { throw "Section $($section.id) must span at least 50 milliseconds." }
        $stem = '{0:00}' -f ($index + 1)
        $wavePath = Join-Path $renderRoot ($stem + '.wav')
        $progressId = 'receiverright-speech-' + [System.Guid]::NewGuid().ToString('N')
        $subscription = Register-ObjectEvent -InputObject $synth -EventName SpeakProgress -SourceIdentifier $progressId
        try {
            # Explicit PCM format keeps SAPI's word-event audio clock aligned with the written WAV.
            $speechFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
            $synth.SetOutputToWaveFile($wavePath, $speechFormat)
            $synth.Speak([string]$section.narration)
            $synth.SetOutputToNull()
            $words = @(Get-Event -SourceIdentifier $progressId -ErrorAction SilentlyContinue | Sort-Object EventIdentifier | ForEach-Object {
                [PSCustomObject]@{ start=$_.SourceEventArgs.AudioPosition.TotalSeconds; position=$_.SourceEventArgs.CharacterPosition; length=$_.SourceEventArgs.CharacterCount }
            })
        } finally {
            Unregister-Event -SourceIdentifier $progressId -ErrorAction SilentlyContinue
            Get-Event -SourceIdentifier $progressId -ErrorAction SilentlyContinue | Remove-Event -ErrorAction SilentlyContinue
        }
        $speechSeconds = Read-Duration $wavePath
        $minimum = [Math]::Max($speechSeconds + 0.8, $sourceSeconds + 0.6)
        $clips.Add([PSCustomObject]@{ index=$index+1; id=[string]$section.id; stem=$stem; framesPath=$framesPath; frames=@($validatedFrames.ToArray()); sourceStartMs=$sourceStartMs; sourceSeconds=$sourceSeconds; title=[string]$section.title; caption=[string]$section.caption; narration=[string]$section.narration; wave=$wavePath; speechSeconds=$speechSeconds; words=$words; seconds=$minimum; finalHoldSeconds=0.0; renderedSeconds=0.0; sourceWidth=0; sourceHeight=0; uiAreaPercent=0.0 })
        Write-Host ("Section {0}/{1} ({2}): {3} captured frames, {4:N2}s source, {5:N2}s narration" -f ($index + 1), $sections.Count, $section.id, $validatedFrames.Count, $sourceSeconds, $speechSeconds)
    }
} finally { $synth.Dispose() }

$minimumTotal = ($clips | Measure-Object -Property seconds -Sum).Sum
$planFile = [System.IO.Path]::ChangeExtension($outputFile, '.plan.json')
$plan = [ordered]@{ minimumDurationSeconds=$minimumTotal; requestedTargetSeconds=$target; hardLimitSeconds=179; playbackSpeed=1.0; sections=@($clips | ForEach-Object { [ordered]@{id=$_.id; frameCount=$_.frames.Count; sourceSeconds=$_.sourceSeconds; narrationSeconds=$_.speechSeconds; minimumSeconds=$_.seconds} }) }
Write-Utf8 $planFile ($plan | ConvertTo-Json -Depth 5)
if ($minimumTotal -gt 178.5) {
    $clips | Sort-Object seconds -Descending | Select-Object id,sourceSeconds,speechSeconds,seconds | Format-Table | Out-Host
    throw ("Normal-speed source footage plus narration needs {0:N2}s. No frames were dropped or sped up. Shorten narration or deliberately record shorter sections; timing report: {1}" -f $minimumTotal,$planFile)
}
$totalSeconds = [Math]::Max($target, $minimumTotal)
$extraPerClip = ($totalSeconds - $minimumTotal) / $clips.Count
$fontRegular = Filter-Path (Join-Path $env:WINDIR 'Fonts/segoeui.ttf')
$fontBold = Filter-Path (Join-Path $env:WINDIR 'Fonts/segoeuib.ttf')
$projectTitlePath = Join-Path $renderRoot 'project-title.txt'
$projectTitle = if ($manifest.title) { [string]$manifest.title } else { 'ReceiveRight' }
Write-Utf8 $projectTitlePath $projectTitle
$walkthroughPath = Join-Path $renderRoot 'walkthrough-label.txt'
Write-Utf8 $walkthroughPath ('Recorded app interactions ' + [char]0x00B7 + ' Synthetic demo ' + [char]0x00B7 + ' Generated narration')
$concatLines = [System.Collections.Generic.List[string]]::new()
$transcript = [System.Collections.Generic.List[string]]::new()
$transcript.Add('ReceiveRight - recorded app interactions')
$transcript.Add("Generated narration: $voiceName. Timestamped browser frames preserve captured interaction timing at normal speed; gaps between recorded sections are omitted. Demonstration data is synthetic.")
$transcript.Add('')

foreach ($clip in $clips) {
    # Only the final captured frame is held longer. Interaction intervals stay unchanged.
    $clip.seconds = [Math]::Ceiling(($clip.seconds + $extraPerClip) * 30) / 30
    $clip.finalHoldSeconds = $clip.seconds - $clip.sourceSeconds
    $frameConcatFile = Join-Path $renderRoot ($clip.stem + '-frames.ffconcat')
    $frameConcat = [System.Collections.Generic.List[string]]::new()
    $frameConcat.Add('ffconcat version 1.0')
    for ($frameIndex = 0; $frameIndex -lt $clip.frames.Count; $frameIndex++) {
        $frame = $clip.frames[$frameIndex]
        $frameSeconds = if ($frameIndex -lt ($clip.frames.Count - 1)) { ([double]$clip.frames[$frameIndex + 1].atMs - [double]$frame.atMs) / 1000.0 } else { $clip.finalHoldSeconds }
        $frameConcat.Add("file '" + $frame.file.Replace('\','/').Replace("'", "'\''") + "'")
        $frameConcat.Add('option framerate 1000')
        $frameConcat.Add('duration ' + (Decimal $frameSeconds))
    }
    # Concat demuxer applies the last duration only when a final packet exists.
    $lastFramePath = [string]$clip.frames[$clip.frames.Count - 1].file
    $frameConcat.Add("file '" + $lastFramePath.Replace('\','/').Replace("'", "'\''") + "'")
    $frameConcat.Add('option framerate 1000')
    Write-Utf8 $frameConcatFile ($frameConcat -join "`n")
    $sourceProbe = & $FfprobePath -v error -select_streams v:0 -show_entries stream=width,height -of json $clip.frames[0].file
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect source dimensions.' }
    $sourceSize = ($sourceProbe -join "`n" | ConvertFrom-Json).streams[0]
    $clip.sourceWidth = [int]$sourceSize.width
    $clip.sourceHeight = [int]$sourceSize.height
    $sourceScale = [Math]::Min(1856.0 / $clip.sourceWidth, 972.0 / $clip.sourceHeight)
    $clip.uiAreaPercent = [Math]::Round((($clip.sourceWidth * $sourceScale) * ($clip.sourceHeight * $sourceScale)) / (1920 * 1080) * 100, 2)
    $titleFile = Join-Path $renderRoot ($clip.stem + '-title.txt')
    $captionFile = Join-Path $renderRoot ($clip.stem + '-caption.txt')
    $counterFile = Join-Path $renderRoot ($clip.stem + '-counter.txt')
    Write-Utf8 $titleFile $clip.title
    Write-Utf8 $captionFile $clip.caption
    Write-Utf8 $counterFile ('{0:00} / {1:00}' -f $clip.index, $clips.Count)
    $filters = @(
        'fps=30',
        'scale=1856:972:force_original_aspect_ratio=decrease:flags=lanczos',
        'pad=1920:1080:(ow-iw)/2:48+(972-ih)/2:color=0xFBFBF5',
        'setsar=1',
        'drawbox=x=0:y=0:w=iw:h=44:color=0x1F5C48:t=fill',
        'drawbox=x=32:y=1022:w=1856:h=1:color=0xDCE3D7:t=fill',
        "drawtext=fontfile=$fontBold`:textfile=$(Filter-Path $projectTitlePath):x=32:y=9:fontsize=24:fontcolor=white:expansion=none",
        "drawtext=fontfile=$fontRegular`:textfile=$(Filter-Path $walkthroughPath):x=252:y=15:fontsize=17:fontcolor=0xD9E5D4:expansion=none",
        "drawtext=fontfile=$fontRegular`:textfile=$(Filter-Path $counterFile):x=w-tw-32:y=13:fontsize=19:fontcolor=white:expansion=none",
        "drawtext=fontfile=$fontBold`:textfile=$(Filter-Path $titleFile):x=32:y=1028:fontsize=22:fontcolor=0x183E34:expansion=none",
        "drawtext=fontfile=$fontRegular`:textfile=$(Filter-Path $captionFile):x=32:y=1057:fontsize=16:line_spacing=3:fontcolor=0x68756C:expansion=none"
    ) -join ','
    $clipFile = Join-Path $renderRoot ($clip.stem + '.mp4')
    Invoke-Ffmpeg @('-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',$frameConcatFile,'-i',$clip.wave,'-vf',$filters,'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','128k','-ar','48000','-ac','2','-af','apad','-t',(Decimal $clip.seconds),'-movflags','+faststart',$clipFile)
    $clip.renderedSeconds = Read-Duration $clipFile
    $concatLines.Add("file '" + $clipFile.Replace('\','/').Replace("'", "'\''") + "'")
    $transcript.Add(('SECTION {0} - {1} ({2:N1}s)' -f $clip.index,$clip.title,$clip.seconds))
    $transcript.Add($clip.narration)
    $transcript.Add('')
    Write-Host ("Rendered section {0}/{1}: {2}" -f $clip.index,$clips.Count,$clip.title)
}

$concatFile = Join-Path $renderRoot 'concat.txt'
Write-Utf8 $concatFile ($concatLines -join "`n")
Invoke-Ffmpeg @('-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',$concatFile,'-c','copy','-movflags','+faststart',$outputFile)
$actualDuration = Read-Duration $outputFile
if ($actualDuration -gt 179) { throw "Rendered duration is $actualDuration seconds; shorten the manifest before publication. No interaction frames were sped up." }
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
    $timeline += $clip.renderedSeconds
}
Write-Utf8 $subtitlePath ($subtitles -join "`r`n")
$reportPath = [System.IO.Path]::ChangeExtension($outputFile, '.render.json')
$report = [ordered]@{
    output=$outputFile; format='Recorded browser interactions assembled from timestamped actual UI frames, with generated narration';
    width=1920; height=1080; frameRate=30; durationSeconds=$actualDuration; voice=$voiceName; subtitles=$subtitlePath; subtitleCues=$cueNumber;
    syntheticData=$true; manifest=$manifestFile; renderedAt=[DateTime]::UtcNow.ToString('o');
    sourcePlaybackSpeed=1.0; interSectionPausesOmitted=$true; interactionFramesDropped=0; outputTimestampQuantizationMs=(1000.0/30); outputSha256=(Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash;
    sections=@($clips | ForEach-Object { [ordered]@{id=$_.id; title=$_.title; frameManifest=$_.framesPath; frameCount=$_.frames.Count; sourceStartMs=$_.sourceStartMs; sourceSeconds=$_.sourceSeconds; sourceWidth=$_.sourceWidth; sourceHeight=$_.sourceHeight; uiAreaPercent=$_.uiAreaPercent; narrationSeconds=$_.speechSeconds; durationSeconds=$_.renderedSeconds; finalFrameHoldSeconds=$_.finalHoldSeconds; narration=$_.narration; frames=$_.frames} })
}
Write-Utf8 $reportPath ($report | ConvertTo-Json -Depth 8)
Write-Host ("Created {0} ({1:N1} seconds). Transcript: {2}" -f $outputFile,$actualDuration,$transcriptPath)
