'use strict';

const Requester = require('./requester');
const entities = require('html-entities').XmlEntities;
const cheerio = require('cheerio');

const rq = new Requester();

const getAuthToken = (done) => {
  rq
    .get('https://loopup.bobsbusiness.co.uk/users/sign_in', 'login-page')
    .exec((err) => {
      let $ = cheerio.load(rq.responses['login-page'].body);
      const authToken = $('input[name=authenticity_token]').attr('value');

      done(authToken, rq.getCookies());
    });
}

const getCourseList = (username, password) => {
  getAuthToken((authToken, cookies) =>{
    let rq2 = new Requester(cookies)
    rq2
      .post('https://loopup.bobsbusiness.co.uk/users/sign_in', {
        utf: '✓',
        authenticity_token: authToken,
        'user[login]': 'chris.howard@loopup.com',
        'user[password]': 'jvcfjmr1',
        'commit': 'Sign in'
      }, 'login')
      .get('https://loopup.bobsbusiness.co.uk/dashboard', 'dashboard')
      .exec((err) => {
        let scriptRegex = /<script ng-cloak preload-resource="(.*)"><\/script>/;
        let courseJson = rq2.responses['dashboard'].body.match(scriptRegex);
        let courses = JSON.parse(entities.decode(courseJson[1])).courses;

        courses.data.forEach((course) => {
          console.log(course);
        })
      })
  });
};

const completeCourse = (course, cookies) => {
  let rq3 = new Requester(cookies);
  rq3
    .get(
      'https://loopup.bobsbusiness.co.uk/enrollments/initiate_scorm_launch/0.json' +
      `?enroll_id=${course.id}` +
      '&course_id=0' +
      '&component_id=0' +
      `&_=${Math.floor(new Date())}`,
      'enroll-1'
    )
    .get(
      'https://loopup.bobsbusiness.co.uk/scorm_api/launch.json'
      `?slt=${7cbbd793237ba77aee6b}` +
      `&comp_id=${216837}` +
      `&enroll_id=${5372127}` +
      `&course_id=0` +
      `&_=${Math.floor(new Date())}`,
      'enroll-2'
    )
}
