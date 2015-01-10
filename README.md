Coins Live (Server)
=================

## API

#####Available markets  
`GET /markets`    

#####History of a single market  
`GET /history/:market`    

Example:  
`GET /history/bitstampBTCUSD`

#####History of multiple markets  
`POST /history` `(array markets)`  

Example:  
`POST /history` `{ markets: ['btceBTCUSD', 'huobiBTCCNY'] }`

## Installation

You need mongodb: http://docs.mongodb.org/manual/installation/

Import the provided market metadata:

    $ mongoimport --db markets --collection markets --file markets.json 

Install node dependencies:

    $ npm install
    
Run the app:

    $ node app.js
