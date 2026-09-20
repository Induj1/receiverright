import serverlessExpress from '@codegenie/serverless-express';
import {createApp} from './app.js';
export const handler=serverlessExpress({app:createApp({serveStatic:false}),binarySettings:{contentTypes:['image/jpeg','image/png','application/pdf','application/octet-stream']}});
