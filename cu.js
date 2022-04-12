const axios = require('axios')
const fs = require('fs')
const url = 'https://www.matsukiyo.co.jp/map/s3/json/'
let list = {}
let attr = {}

Promise.all([
    axios(url+'stores.json').then(async ({ data }) => {
        list = data.filter(function(item){
            if (/\d{8}0\d{2}/.test(item.services)) return true
        });
    }),
    axios(url+'storeAttributes.json').then(async ({ data }) => {
        attr = data
    })
]).finally(() => {
    let body = ""
    list.forEach((item) => {
        let services = ""
        item.services.split('').forEach((i, k) => {
            if(i == 1 && attr.services[k][2]) services += "<img src='https://www.matsukiyo.co.jp/map/s3/icon/"+attr.services[k][2]+"'>"
        })
        body += "<tr><td>"+item.name+"</td><td>"+item.address+"</td><td>"+item.closed_day+"</td><td>"+services+"</td><td><a target='_blank' href='https://www.matsukiyo.co.jp/map?kid="+item.id+"'>https://www.matsukiyo.co.jp/map?kid="+item.id+"</a></td></tr>\n"
    })
    fs.writeFileSync('./list.html', body)
    axios.post('https://api.daco.dev/w/?key=', {text: "マツキヨ包括加盟店リストを更新しました。\nhttps://api.daco.dev/m"}).then(function (response) {
        console.log(response);
    })
})