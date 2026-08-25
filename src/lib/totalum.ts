import 'server-only'; // Enforces server-only because totalum-api-sdk access to all database, and we can't expose that to client
import { TotalumApiSdk, type AuthOptions } from 'totalum-api-sdk';
import { serverEnv } from '@/lib/env';


const apiKey = serverEnv.TOTALUM_API_KEY;
const baseUrl = serverEnv.TOTALUM_API_URL;


const options: AuthOptions = {
  apiKey: { 'api-key': apiKey }
};

export const totalumSdk = new TotalumApiSdk(options);


totalumSdk.changeBaseUrl(baseUrl);
