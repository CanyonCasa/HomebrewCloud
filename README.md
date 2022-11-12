# HomebrewCloud
 HomebrewDIY derivative for AWS Lightsail. 

 ## Instance Setup

### Prerequisites
* Create an AWS account
* Setup AWS account users
* Create a Lightsail Instance
  * Select a region
  * Linux distro
  * Node app

Additional customization may be needed as desired such as setting your timezone.

### SSH Via browser
From the Lightsail instance in the management console click the _'prompt >_ icon'_ to open a connection window in a browser window directly to the instance. 

## SSH Via Putty
From the Lightsail instance in the management console click the _'vertical ... icon'_  to open the instance management window.

Note the CONNECT TO public IP address. This is the host to which Putty will connect. Enter into the Putty configuration. **Note: May change if not a static IP.**

Scroll to the bottom and click the _'Download default key'_. Save the file to a **secure** location. Use PuttyGen to convert the _.pem_ file to a _.ppk_ file. Load the file then Save as Private Key.

Enter the file file location into Putty settings under _Connections | SSH | Auth | Private key file for authentication_.

Under _Connections | Data | Auto-login username_ enter _bitnami_.

Set any other desired settings such as colors then save settings.

Open to create a connection.

## Putting Homebrew in the Cloud
The Lightsail Linux/NodeJS blueprint defaults to running the Apache web server at the standard http (80) and https (443) ports.

You have at least 4 ways to run the Homebrew code in the AWS Lightsail cloud environemnt. Basic setup for each requires dealing with this default Apache setup in one way or another. Each method has pros and cons as outlined in the descriptions below.

## METHOD 1: Use Apache as a Proxy
In this setup you configure Apache to proxy requests sent to the standard ports onto the NodeJS app configured ports.

Pros/Cons
* Apache dependency
* Minimal impact/changes to default setup
* Automatic certificate handling
* Multiple NodeJS endpoints with more involved/complex virtual hosts setup.

### How To
For this method you configure Apache to proxy requests to the localhost:port defined for the NodeJS app. Create the _/opt/bitnami/apache/conf/vhosts/app-https-vhost.conf_ file with the following contents...

    <VirtualHost _default_:443>
    ServerName YOUR_SERVER_NAME
    #ServerAlias *
    SSLEngine on
    SSLCertificateFile "/opt/bitnami/apache/conf/bitnami/certs/server.crt"
    SSLCertificateKeyFile "/opt/bitnami/apache/conf/bitnami/certs/server.key"
    #DocumentRoot /opt/bitnami/projects/sample
    #<Directory "/opt/bitnami/projects/sample">
    #  Options -Indexes +FollowSymLinks -MultiViews
    #  Require all granted
    #</Directory>
    ProxyPass / http://localhost:PORT/
    ProxyPassReverse / http://localhost:PORT/
    </VirtualHost>

Be sure to change YOUR_SERVER_NAME and PORT to those of your app.

After defining your domain/hosts and ensuring proper DNS setup, run the following command:

    sudo /opt/bitnami/bncert-tool

This will create a Let's Encrypt certificate, setup automatic renewal, and redirect http requests to https.

## METHOD 2: Reassign Default Apache Ports
In this setup you configure Apache to use alternate ports so the NodeJS app can use the standard ports.

Pros/Cons
* Apache dependency
* Minimal impact/changes to default setup
* Certificate handling?
* NodeJS app run as root or IP tables configured to forward privileged ports to non-privileged ports. (Note: by design the Homebrew apps all assume non-root operation.)

### How To
Apache uses the default web hosting ports, which you will want to reassign so user can access your app using the defaults ports, 80 and 443.

Edit the _/opt/bitnami/apache2/conf/httpd.conf_ file and change the line 

    Listen 80

to the lines 

    #Listen 80
    Listen 8080

Where port 8080 (or other port of your choice) is the new Apache port. Save and exit.

Then edit the _/opt/bitnami/apache2/conf/bitnami/bitnami.conf_ file and change the line 

    <VirtualHost _default_:80>

to 

    <VirtualHost _default_:8080>

Where the port number matches the value set above in the _httpd.conf_ file.   

Then restart apache using the bitnami control script

    sudo /opt/bitnami/ctlscript.sh restart apache

Then open the firewall for the specific port... Open the Lightsail management console for the instance and click Networking. Scroll down to IPv4 Firewall and add a rule for port 8080 (or port of choice defined above).

#################################

**TBD: Then same must be done for port 443.**

#################################

Ports 80 and 443 are then available for the Homebrew app use. Note, Linux considered ports below 1024 as privileged requiring root permissions. The iptables command can be used (as described elsewhere in Homebrew documentation) to map the privileged ports to non-privileged ports.

## METHOD 3: Bypass Apache 
In this setup you disable the Apache server altogether and use the HomebrewDIY code to proxy to one or more backend NodeJS apps.

Pros/Cons
* No Apache dependency
* Greater changes to the default setup
* Certificate handling?
* NodeJS app run as root or IP tables configured to forward privileged ports to non-privileged ports. (Note: by design the Homebrew apps all assume non-root operation.)
* Multiple NodeJS apps or services run from a single IP address.

### How To
To disable Apache, first stop the server by running

    sudo /opt/bitnami/ctlscript.sh stop

Then disable the service from running again at startup

    sudo systemctl disable apache

This totally disables Apache. In this case you will need a fully featured NodeJS app such as HomebrewDIY to manage everything.

## METHOD 4: Use Alternate Ports 
In this setup you leave the default Apache server setup and run the NodeJS at alternate ports such as the common 8080. While this method is not user friendly (since external users must include the port number in the request URL, it does offer a simple setup for internal API operations.

Pros/Cons
* No Apache dependency
* No changes to the default setup
* Certificate handling?
* NodeJS app runs on alternate ports, which must be specified in http/s requests.
* Multiple NodeJS apps or services run from a single IP address.
* Requires opening additional ports, which creates a large security cross-section.

## How To
This method requires no changes to Apache. Instead simply install your NodeJS app on port(s) of choice. Access it with http://SERVER-IP:PORT.

Then open the firewall for the specific port... Open the Lightsail management console for the instance and click Networking. Scroll down to IPv4 Firewall and add a rule for port 8080 (or port of choice defined above).


#################################

#################################

## Sample (Default) NodeJS App
Install your NodeJS app or a temporary one. Install the  default sample as follows.

    sudo mkdir /opt/bitnami/projects
    sudo chown $USER /opt/bitnami/projects
    cd /opt/bitnami/projects
    express --view pug sample
    cd sample
    npm install

Start this app with

    DEBUG=sample:* ./bin/www

Access it with http://SERVER-IP:3000/ via a SSH tunnel




