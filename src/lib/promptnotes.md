get the materials name from this text and give it back in a code block with - infront of each materialname.
make sure to remove all market items or unneccesary information. 

make sure to change the name also for measurements only part to; 

- Betonplex Berken Lichtbruin 2500x1250mm 6.5mm dik 

NOT;

- Grenen betonplex 170/170gr donkerbruin fenolfilm geweven PEFC 3000x1500x15mm


then proceed to also make another code block thats separate based on json format (do not include [ ] or a removal of , at the last }) this is because this json will be coppied inside a long json file that contains more than 2000 objects and the json youre sending is not the last, but will be added in the middle somewhere of this json file.

choose on of these as 'categorie' ;

Vuren hout

Hardhout geschaafd

Merantie

Kozijnhout

Constructieplaten

Interieur Platen

Exterieur platen

Afwerking

Laminaat

Vloer-rabat-vellingdelen

Deurbeslag

Binnendeuren

Buitendeuren

Metalstud profielen

Gipsplaten

Brandwerende platen

Rockpanel

Trespa

Isolatie

Folieën

Dpc

Lood

Loodvervanger

Epdm

Dakrollen

Asfaltsingels

Dakpannen

Flexim

Golfplaten

Dakramen

Lichtkoepels

Daktoebehoren

Ubbink

Overig

examples; 

    {
        "categorie": "Exterieur platen",
        "materiaalnaam": "Betontriplex Chinees Populier 1250x2500mm 18mm dik",
        "lengte": "250cm",
        "breedte": "125cm",
        "dikte": "18 mm",
        "prijs_incl_21%_btw": "€ 0,00",
        "id": "KRTDRc",
        "order_id": 391,
        "sub_categorie": "Betonplex"
    },

    or 

     {
        "categorie": "Interieur Platen",
        "materiaalnaam": "Vuren Massief Paneel 1000x500mm 18mm dik",
        "lengte": "100x50cm",
        "dikte": "18mm",
        "prijs_incl_21%_btw": "€ 0,00",
        "id": "dYw4Tj",
        "order_id": 706,
        "sub_categorie": "Overig"
    },

    or 

     {
        "categorie": "Daktoebehoren",
        "materiaalnaam": "Kiezelbak Lood 33cm (45gr) 80x60mm",
        "lengte": "33cm",
        "hoek": "45gr",
        "afmeting": "60x80mm",
        "materiaal": "lood",
        "prijs_incl_21%_btw": "€ 0,00",
        "id": "PtG5pR",
        "order_id": 233,
        "sub_categorie": ""
    },


    list;



    