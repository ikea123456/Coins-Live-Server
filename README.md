Coins Live (Server)
=================

Realtime bitcoin data



## Installation

You need mongodb: http://docs.mongodb.org/manual/installation/

Import the provided market metadata:

    $ mongoimport --db markets --collection markets --file markets.json 

Install node dependencies:

    $ npm install
    
You should be good to go:

    $ node scraper.js
