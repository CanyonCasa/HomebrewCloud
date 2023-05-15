let private = require('../restricted/private.js')

let {accountSID:accountSid, authToken, number, admin} = private.twilio;


const client = require('twilio')(accountSid, authToken);

client.messages
  .create({
     body: 'SaranamABQ Twilio Test',
     from: number,
     to: admin
   })
  .then(message => console.log(message.sid,message));
