const assert = require('assert');
const nock = require('nock');
require('chai').should();

const K8sApiFetcher = require('./k8sApiFetcher');

describe('K8sApiFetcher', function () {

    before(() => {
        let k8sMock = nock('http://127.0.0.1:8001');
        k8sMock.get('/ok').reply(200, '{"ok": "ok"}');
        k8sMock.get('/failure').reply(200, '<h1>foo</h1>');
    });

    it('should extract information from k8s API call', () => {
        return new K8sApiFetcher('name', 'http://127.0.0.1:8001/ok').fetch().then(
            () => { assert(true); },
            () => { assert(false); } );

    });

    it('should handle errors', () => {
        return new K8sApiFetcher('name', 'http://127.0.0.1:8001/doesnotexists').fetch().then(
            () => { assert(false) },
            (error) => { error.should.have.string("Request to k8s failed.") });
    });

    it('should handle non json result errors', () => {
        return new K8sApiFetcher('name', 'http://127.0.0.1:8001/failure').fetch().then(
            () => { assert(false) },
            (error) => { error.should.have.string("Unable to fetch") });
    });
});