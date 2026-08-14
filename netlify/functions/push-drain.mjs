import { createScheduledPushDrain } from '../../server/netlify-push-drain.mjs';

const drain = createScheduledPushDrain();

export default async () => {
  await drain();
};
