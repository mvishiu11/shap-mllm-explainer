#!/bin/bash

# A simple script to record audio from the default microphone using ffmpeg.

# --- Configuration ---
DEFAULT_DURATION=5 # seconds
DEFAULT_FILENAME="data/my_voice.wav"
SAMPLERATE=24000 # LFM2's Mimi codec expects 24kHz audio

# --- Get Filename and Duration from Arguments ---
FILENAME=${1:-$DEFAULT_FILENAME}
DURATION=${2:-$DEFAULT_DURATION}

echo "Starting a $DURATION-second recording..."
echo "Speak into your microphone now."
echo "Saving to -> $FILENAME"

# --- Run ffmpeg ---
# -f alsa: Use the ALSA audio system on Linux.
# -i default: Use the default recording device.
# -t $DURATION: Record for the specified duration.
# -ar $SAMPLERATE: Set the audio sample rate to 24000 Hz.
# -ac 1: Set the audio channels to 1 (mono).
# -y: Overwrite the output file if it exists.
ffmpeg -f alsa -i default -t "$DURATION" -ar "$SAMPLERATE" -ac 1 -y "$FILENAME" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "Recording finished successfully."
else
    echo "Error: Recording failed. Is ffmpeg installed and microphone accessible?"
fi
