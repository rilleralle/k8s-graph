'use strict';

const assert = require('assert');
const sinon = require('sinon');
//require('chai').should();

const Server = require('./server');

describe('Server', () => {

    before(() => {
        this.underTest = new Server();
        this.ioSpy = sinon.spy(this.underTest.io, 'emit');
        this.namespaceStub = sinon.stub(this.underTest.namespaceFetcher, 'fetch').returns(new Promise((resolve) => {
            resolve(require('../test/namespaces'))
        }));
        this.nodeStub = sinon.stub(this.underTest.nodesFetcher, 'fetch').returns(new Promise((resolve) => {
            resolve(require('../test/nodes'))
        }));
        this.podsStub = sinon.stub(this.underTest.podsFetcher, 'fetch').returns(new Promise((resolve) => {
            resolve(require('../test/defaultPods'))
        }));
    });

    afterEach(() => {
        this.ioSpy.resetHistory();
        this.underTest.stop();
    });

    it('should extract information from K8S API', () => {
        this.underTest.start();
        return this.underTest.fetch().then(() => {
            assert(this.underTest.io.emit.calledOnce);
        });
    });

    it('should handle namespace error', () => {
        this.namespaceStub.returns(new Promise(((resolve, reject) => reject("Nop"))));
        this.underTest.start();
        return this.underTest.fetch().then(() => {
            assert.equal(this.underTest.io.emit.getCall(0).args[0], 'error');
        });
    });

    it('should handle pod error', () => {
        this.podsStub.returns(new Promise(((resolve, reject) => reject("Nop"))));
        this.underTest.start();
        return this.underTest.fetch().then(
            () => assert(false),
            () => assert.equal(this.underTest.io.emit.getCall(0).args[0], 'error'));
    });

    it('should handle node error', () => {
        this.nodeStub.returns(new Promise(((resolve, reject) => reject("Nop"))));
        this.underTest.start();
        return this.underTest.fetch().then(
            () => assert(false),
            () => assert.equal(this.underTest.io.emit.getCall(0).args[0], 'error'));
    });
});