Coins Live (Server)
=================

Realtime bitcoin data



## Installation

Import the provided market metadata into mongodb:

    $ mongoimport --db markets --collection markets --file markets.json 

Install the dependencies:

    $ npm install
    
You should be good to go:

    $ node scraper.js
