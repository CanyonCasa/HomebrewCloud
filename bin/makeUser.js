// utility to create Homebrew (initial root) user interactively...
// modify to add/change 'other' fields as necessary

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const hash = (msg,algo='sha256',enc='hex') => crypto.createHash(algo).update(msg).digest(enc);

const rd = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function ask(prompt) {
  return new Promise((resolve,reject)=>{rd.question(prompt,(answer)=> resolve(answer))})
};

(async function() {
    
    let user = {
        username: '',
        credentials: {
            hash: '',
            pin: '',
            passcode : {},
        },
        member: '',
        fullname: '',
        email: '',
        phone: '',
        other: {    //customize as necessary
            account: '',
            location: '',
            unit: '',
            tag: ''
        },
        status: 'INACTIVE'
    };
    
    ITERATIONS = 11;
    console.log('Enter credentials and permissions...');
    user.username = await ask('Enter the username: ');
    let pw = await ask('Enter a password: ');
    let test = await ask('Enter an optional challenge: ');
    user.pin = (await ask('Enter a pin[1234]: ')) || 1234;
    user.member = await ask('Enter group membership permissions (i.e. users,cms,...): ');
    user.status = (await ask('Enter user status[ACTIVE](i.e. PENDING,ACTIVE,INACTIVE): ')) || 'ACTIVE';
    
    console.log('\nEnter identification...');
    user.fullname = await ask('Enter user\'s fullname: ');
    user.email = await ask('Enter email: ');
    user.phone = await ask('Enter phone: ');
    
    
    console.log('\nEnter other data...');
    for (let x of Object.keys(user.other)) {
        user.other[x] = await ask(`Enter ${x}: `);
        };

    // build...
    user.credentials.oldHash = bcrypt.hashSync(hash(user.username+pw),8);
    user.credentials.hash = bcrypt.hashSync(pw, ITERATIONS);
    
    console.log(JSON.stringify(user));
    console.log(JSON.stringify(user,null,2));
    
    if (test) {
        let check = {
            pw: bcrypt.compareSync(pw,test),
            old: bcrypt.compareSync(hash(user.username+pw),test)
        };
        console.log('check: ', check);
    };
    rd.close();
    
})().catch(e=>console.error(e));
