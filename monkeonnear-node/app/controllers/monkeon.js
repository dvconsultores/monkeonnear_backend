const { CONFIG } = require('../helpers/utils')
const { dbConnect } = require('../../config/postgres')
const nearAPI = require("near-api-js");
const nearSEED = require("near-seed-phrase");
const bip32 = require('bip32')
const bip39 = require('bip39')
const bitcoin = require('bitcoinjs-lib')
const Web3 = require('web3');
const ethers = require('ethers');
const axios = require('axios');
const moment = require('moment');
/*
const secp = require('tiny-secp256k1');
const ecfacory = require('ecpair');
const path = require('path');
const { ParaSwap } = require('paraswap');
const { response } = require('express');
*/

const { utils, Contract, keyStores, KeyPair , Near, Account} = nearAPI;



const SIGNER_ID = process.env.SIGNER_ID;
const SIGNER_PRIVATEKEY = process.env.SIGNER_PRIVATEKEY;
const NETWORK = process.env.NETWORK;
const keyStore = new keyStores.InMemoryKeyStore()
const keyPair = KeyPair.fromString(SIGNER_PRIVATEKEY)
keyStore.setKey(NETWORK, SIGNER_ID, keyPair)
const near = new Near(CONFIG(keyStore))
const account = new Account(near.connection, SIGNER_ID)


const SalesOfTheDay = async (req, res) => {
    console.log(moment().format());
    console.log(moment().subtract(48, 'h').valueOf()*1000000)
    console.log(moment().subtract(24, 'h').valueOf()*1000000)
    console.log(moment().valueOf()*1000000)
    console.log('dia en curso ', moment(moment().format('DD/MM/YYYY'), 'DD/MM/YYYY').valueOf()*1000000)
    console.log('1 dia atras ', moment(moment().subtract(1, 'd').format('DD/MM/YYYY'), 'DD/MM/YYYY').valueOf()*1000000)
    console.log('2 dias atras ', moment(moment().subtract(2, 'd').format('DD/MM/YYYY'), 'DD/MM/YYYY').valueOf()*1000000)
    console.log('1 hora atras ', moment().subtract(1, 'h').valueOf()*1000000)
    console.log('24 horas atras ', moment(moment().subtract(24, 'h').format('DD/MM/YYYY'), 'DD/MM/YYYY').valueOf()*1000000)
    console.log('48 horas atras ', moment(moment().subtract(48, 'h').format('DD/MM/YYYY'), 'DD/MM/YYYY').valueOf()*1000000)
    console.log('24 horas atras ', moment().subtract(24, 'h').valueOf()*1000000)
    console.log('24 horas atras ', moment().subtract(48, 'h').valueOf()*1000000)
    console.log('7 dias atras ', moment().subtract(7, 'd').valueOf()*1000000)
    console.log('14 dias atras ', moment().subtract(14, 'd').valueOf()*1000000)
    try {
        const { top } = req.body
        const tiempoTranscurrido = moment(moment().subtract(24, 'h').format('DD/MM/YYYY'), 'DD/MM/YYYY').valueOf();
        const fecha2 = (new Date(new Date(tiempoTranscurrido).toLocaleDateString()).getTime()/1000.0)*1000000000;

        //const fecha = moment(moment().format('DD/MM/YYYY'), 'DD/MM/YYYY').valueOf()*1000000;
        const fecha = moment().subtract(24, 'h').valueOf()*1000000;
        
        console.log(fecha)
        console.log(fecha2)
        const conexion = await dbConnect()
        const resultados = await conexion.query("select \
                                                    fecha, \
                                                    nft_contract_id, \
                                                    max_price \
                                                from ( \
                                                        SELECT \
                                                            max(to_timestamp(x.receipt_included_in_block_timestamp::numeric/1000000000)) as fecha, \
                                                            x.receipt_receiver_account_id as nft_contract_id, \
                                                            max(cast(x.args-> 'args_json' ->> 'balance' as numeric)) / 1000000000000000000000000 as max_price \
                                                        FROM public.action_receipt_actions x \
                                                        inner join execution_outcomes eo on x.receipt_id = eo.receipt_id \
                                                        where \
                                                            x.receipt_included_in_block_timestamp > $1 \
                                                            and receipt_predecessor_account_id in ('apollo42.near', 'marketplace.paras.near', 'market1.naksh.near', 'market.mintbase1.near') \
                                                            and args->>'method_name' = 'nft_transfer_payout' \
                                                            and eo.status = 'SUCCESS_VALUE' \
                                                        group by  \
                                                            x.receipt_receiver_account_id \
                                                    ) a \
                                                order by max_price desc \
                                                limit $2 \
                                                ", [fecha, top])
        const arreglo = [];
        try {
            const datas = resultados.rows;
            for(var i = 0; i < datas.length; i++) {
                const contract = new Contract(account, datas[i].nft_contract_id, {
                    viewMethods: ['nft_metadata'],
                    sender: account
                })
        
                const response = await contract.nft_metadata()
                arreglo.push({
                    fecha: datas[i].fecha,
                    name: response.name,
                    symbol: response.symbol,
                    icon: response.icon,
                    base_uri: response.base_uri,
                    nft_contract_id: datas[i].nft_contract_id,
                    max_price: datas[i].max_price
                });

            }
            console.log(arreglo);
            
        } catch (error) {
            console.log('error 2: ', error)
            res.error
        }
        
        res.json(arreglo)
    } catch (error) {
        console.log('error 1: ', error)
        res.error
    }
}


const HighestVOLGainers = async (req, res) => {
    try {
        const { top } = req.body;
        const fecha24h = moment().subtract(24, 'h').valueOf()*1000000;
        const fecha48h = moment().subtract(48, 'h').valueOf()*1000000;
        console.log('24 horas atras ', fecha24h);
        console.log('48 horas atras ', fecha48h);
        const conexion = await dbConnect();
        const resultados = await conexion.query("select \
                                                    fecha, \
                                                    nft_contract_id, \
                                                    volumen24h, \
                                                    volumen48h, \
                                                    porcentaje \
                                                from ( \
                                                        SELECT \
                                                            max(to_timestamp(x.receipt_included_in_block_timestamp::numeric/1000000000)) as fecha, \
                                                            x.receipt_receiver_account_id as nft_contract_id, \
                                                            sum(cast(x.args-> 'args_json' ->> 'balance' as numeric) / 1000000000000000000000000) as volumen24h, \
                                                            max(sub.volumen48h) as volumen48h, \
                                                            ((sum(cast(x.args-> 'args_json' ->> 'balance' as numeric) / 1000000000000000000000000) / max(sub.volumen48h)) * 100) - 100 as porcentaje \
                                                        FROM public.action_receipt_actions x \
                                                        inner join execution_outcomes eo on x.receipt_id = eo.receipt_id \
                                                        inner join ( \
                                                            SELECT \
                                                                x.receipt_receiver_account_id as nft_contract_id, \
                                                                sum(cast(x.args-> 'args_json' ->> 'balance' as numeric) / 1000000000000000000000000) as volumen48h \
                                                            FROM public.action_receipt_actions x \
                                                            inner join execution_outcomes eo on x.receipt_id = eo.receipt_id \
                                                            where \
                                                                x.receipt_included_in_block_timestamp > $1 \
                                                                and x.receipt_included_in_block_timestamp < $2 \
                                                                and receipt_predecessor_account_id in ('apollo42.near', 'marketplace.paras.near', 'market1.naksh.near', 'market.mintbase1.near') \
                                                                and args->>'method_name' = 'nft_transfer_payout' \
                                                                and eo.status = 'SUCCESS_VALUE' \
                                                            group by \
                                                                x.receipt_receiver_account_id \
                                                        ) sub on x.receipt_receiver_account_id = sub.nft_contract_id \
                                                        where \
                                                            x.receipt_included_in_block_timestamp > $3 \
                                                            and receipt_predecessor_account_id in ('apollo42.near', 'marketplace.paras.near', 'market1.naksh.near', 'market.mintbase1.near') \
                                                            and args->>'method_name' = 'nft_transfer_payout' \
                                                            and eo.status = 'SUCCESS_VALUE' \
                                                        group by \
                                                            x.receipt_receiver_account_id \
                                                    ) a \
                                                order by porcentaje desc \
                                                limit $4 \
                                                    ", [fecha48h, fecha24h, fecha24h, top]);

        const arreglo = [];
        try {
            const datas = resultados.rows;
            for(var i = 0; i < datas.length; i++) {
                const contract = new Contract(account, datas[i].nft_contract_id, {
                    viewMethods: ['nft_metadata'],
                    sender: account
                })
        
                const response = await contract.nft_metadata()
                arreglo.push({
                    fecha: datas[i].fecha,
                    name: response.name,
                    symbol: response.symbol,
                    icon: response.icon,
                    base_uri: response.base_uri,
                    nft_contract_id: datas[i].nft_contract_id,
                    volumen24h: datas[i].volumen24h,
                    volumen48h: datas[i].volumen48h,
                    porcentaje: datas[i].porcentaje,
                    max_price: datas[i].max_price
                });

            }
            console.log(arreglo);
        } catch (error) {
            console.log('error 2: ', error)
            res.error
        }
        res.json(arreglo)
    } catch (error) {
        console.log('error 1: ', error)
        res.error
    }
}

const Volumen24h = async (req, res) => {
    try {
        const fecha24h = moment().subtract(24, 'h').valueOf()*1000000;
        const fecha48h = moment().subtract(48, 'h').valueOf()*1000000;
        console.log(fecha24h)
        console.log(fecha48h)
        const conexion = await dbConnect()
        const resultados = await conexion.query("select \
                                                    volumen24h, \
                                                    volumen48h, \
                                                    ((volumen24h / volumen48h) * 100) - 100 as porcentaje \
                                                from ( \
                                                        select \
                                                            (SELECT \
                                                                sum(cast(x.args-> 'args_json' ->> 'balance' as numeric) / 1000000000000000000000000) as volumen \
                                                            FROM public.action_receipt_actions x \
                                                            inner join execution_outcomes eo on x.receipt_id = eo.receipt_id \
                                                            where \
                                                                x.receipt_included_in_block_timestamp > $1 \
                                                                and receipt_predecessor_account_id in ('marketplace.paras.near') \
                                                                and args->>'method_name' = 'nft_transfer_payout' \
                                                                and eo.status = 'SUCCESS_VALUE' \
                                                            ) as volumen24h, \
                                                            (SELECT \
                                                                    sum(cast(x.args-> 'args_json' ->> 'balance' as numeric) / 1000000000000000000000000) as volumen48h \
                                                                FROM public.action_receipt_actions x \
                                                                inner join execution_outcomes eo on x.receipt_id = eo.receipt_id \
                                                                where \
                                                                    x.receipt_included_in_block_timestamp > $2 \
                                                                    and x.receipt_included_in_block_timestamp < $3 \
                                                                    and receipt_predecessor_account_id in ('marketplace.paras.near') \
                                                                    and args->>'method_name' = 'nft_transfer_payout' \
                                                                    and eo.status = 'SUCCESS_VALUE' \
                                                            ) as volumen48h \
                                                    ) sub \
                                                ", [fecha24h, fecha48h, fecha24h])
        res.json(resultados.rows)
    } catch (error) {
        res.error
    }
}



module.exports = { SalesOfTheDay, HighestVOLGainers, Volumen24h }