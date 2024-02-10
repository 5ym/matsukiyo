import { writeFileSync } from "fs";

const mapUrl = 'https://www.matsukiyococokara-online.com/map'
const url = mapUrl + '/s3/json/'
let list: any
let attr: any

Promise.all([
    fetch(url+'stores.json').then((data) => data.json()).then((json) => {
        list = json.filter(function(item){
            if (/\d{8}0\d{2}/.test(item.services)) return true
        });
    }),
    fetch(url+'storeAttributes.json').then((data) => data.json()).then((json) => {
        attr = json
    })
]).finally(() => {
    let body = ""
    list.forEach((item: any) => {
        let services = ""
        item.services.split('').forEach((i, k) => {
            if(i == 1 && attr.services[k][2]) services += `<div style="display:inline-block;width:3em;"><img src="${mapUrl}/s3/icon/${attr.services[k][2]}"></div>`
        })
        body += `<tr><td>${item.name}</td><td>${item.address}</td><td>${item.closed_day}</td><td>${services}</td><td><a target="_blank" href="${mapUrl}?kid=${item.id}">${mapUrl}?kid=${item.id}</a></td></tr>`
    })
    writeFileSync('./list.html', body)
})
