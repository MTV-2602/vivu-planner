import { chatWithItinerary } from './services/geminiService';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  console.log('Starting chat test...');
  try {
    const res = await chatWithItinerary(
      'xin chào bạn bạn là ai giúp gì dc cho tôi',
      []
    );
    console.log('SUCCESS:', JSON.stringify(res, null, 2));
  } catch (err: any) {
    console.error('FAILED WITH ERROR:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
  }
}

test();
