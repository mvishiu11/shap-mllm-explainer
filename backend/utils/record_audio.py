import sounddevice as sd
import soundfile as sf
import numpy as np
import argparse
import time
import sys

def list_audio_devices():
    """Prints available audio devices."""
    print("\n--- Available Audio Devices ---")
    try:
        devices = sd.query_devices()
        print(devices)
        default_input = sd.default.device[0]
        print(f"\nDefault Input Device Index: {default_input}")
        if default_input != -1 and isinstance(devices, list):
             # Handle case where devices might be a dict (older sounddevice?)
             if isinstance(devices[default_input], dict):
                  print(f"Default Input Device Name: {devices[default_input].get('name', 'N/A')}")
             else: # Assume it's an object with a name attribute
                  print(f"Default Input Device Name: {getattr(devices[default_input], 'name', 'N/A')}")

        elif isinstance(devices, dict): # Handle dict case for default
             dev_info = devices.get(default_input)
             if dev_info:
                 print(f"Default Input Device Name: {dev_info.get('name', 'N/A')}")

    except Exception as e:
        print(f"Could not query audio devices: {e}", file=sys.stderr)
    print("-----------------------------\n")


def record_audio(filename: str, duration: int, samplerate: int):
    """Records audio from the default microphone and saves it to a WAV file."""
    
    # Check if input device is available
    try:
        sd.check_input_settings()
        logger.info("Input device check successful.")
    except Exception as e:
        print(f"Error checking input device: {e}", file=sys.stderr)
        print("Please ensure a microphone is connected and configured.", file=sys.stderr)
        list_audio_devices() # Show devices to help debug
        sys.exit(1)
        
    print(f"Recording for {duration} seconds at {samplerate}Hz...")
    print("Speak now!")

    # Record audio
    try:
        recording = sd.rec(int(duration * samplerate), samplerate=samplerate, channels=1, dtype='float32', blocking=True)
        # Using blocking=True simplifies waiting, sd.wait() is not needed
        
        print("\nRecording finished.")

        # --- Diagnostic Check for Silence ---
        max_amplitude = np.max(np.abs(recording))
        if max_amplitude < 0.01: # Threshold for considering it silent (adjust if needed)
             print(f"WARNING: Recorded audio seems silent (max amplitude: {max_amplitude:.4f}). Check microphone input level and selection.")
        else:
             print(f"Audio recorded successfully (max amplitude: {max_amplitude:.4f}).")
        # ------------------------------------

        # Save as WAV file
        sf.write(filename, recording, samplerate)
        print(f"Audio saved to '{filename}'")

    except Exception as e:
        print(f"\nAn error occurred during recording or saving: {e}", file=sys.stderr)
        print("Please ensure you have permissions and the sounddevice library is correctly installed.")
        sys.exit(1)

if __name__ == "__main__":
    # Add logger configuration
    import logging
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    logger = logging.getLogger(__name__)

    parser = argparse.ArgumentParser(description="Record audio from the microphone.")
    parser.add_argument(
        "filename", nargs="?", default="my_voice.wav",
        help="Output WAV file name (default: my_voice.wav)"
    )
    parser.add_argument(
        "-d", "--duration", type=int, default=5,
        help="Recording duration in seconds (default: 5)"
    )
    parser.add_argument(
        "-sr", "--samplerate", type=int, default=24000,
        help="Sample rate in Hz (default: 24000)"
    )
    parser.add_argument(
        "--list-devices", action="store_true",
        help="List available audio devices and exit."
    )
    
    args = parser.parse_args()

    if args.list_devices:
        list_audio_devices()
        sys.exit(0)
    
    # List devices before recording for info
    list_audio_devices()
    
    record_audio(args.filename, args.duration, args.samplerate)
