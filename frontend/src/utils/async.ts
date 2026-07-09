/** Races a promise against a timeout so async work cannot hang the UI indefinitely. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

export const GPS_TIMEOUT_MS = 10_000;
export const CHECK_IN_API_TIMEOUT_MS = 60_000;

export const GPS_TIMEOUT_MESSAGE =
  "Unable to get your location. Please enable GPS and try again.";

export const CHECK_IN_TIMEOUT_MESSAGE =
  "Check-in timed out. Please check your connection and try again.";
