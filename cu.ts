import { writeFileSync } from "fs";

const url = 'https://www.matsukiyo.co.jp/map/s3/json/'
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
            if(i == 1 && attr.services[k][2]) services += "<img src='https://www.matsukiyo.co.jp/map/s3/icon/"+attr.services[k][2]+"'>"
        })
        body += "<tr><td>"+item.name+"</td><td>"+item.address+"</td><td>"+item.closed_day+"</td><td><div class="img-wrap">"+services+"</div></td><td><a target='_blank' href='https://www.matsukiyo.co.jp/map?kid="+item.id+"'>https://www.matsukiyo.co.jp/map?kid="+item.id+"</a></td></tr>\n"
    })
    writeFileSync('./list.html', body)
})
