export type VideoHandlerOpts = {
  video: HTMLVideoElement;
  debug: boolean;
};

export type FetchFunction = (input: string | URL | Request, init?: any) => Promise<Response>;
export type ChaimuOpts = {
  url: string;
  video: HTMLVideoElement;
  debug?: boolean;
  fetchFn?: FetchFunction;
  preferAudio?: boolean;
};
